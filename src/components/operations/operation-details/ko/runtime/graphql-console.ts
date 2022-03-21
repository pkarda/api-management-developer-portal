import * as ko from "knockout";
import * as validation from "knockout.validation";
import * as GraphQL from "graphql";
import * as monaco from "monaco-editor";
import loader from '@monaco-editor/loader';
import { Component, OnMounted, Param } from "@paperbits/common/ko/decorators";
import { HttpClient, HttpRequest, HttpResponse } from "@paperbits/common/http";
import template from "./graphql-console.html";
import graphqlExplorer from "./graphql-explorer.html";
import { Api } from "../../../../../models/api";
import { RouteHelper } from "../../../../../routing/routeHelper";
import { QueryEditorSettings, VariablesEditorSettings, ResponseSettings, GraphqlTypes, GraphqlCustomFieldNames, GraphqlTypesForDocumentation, GraphqlMetaField } from "./../../../../../constants";
import { AuthorizationServer } from "../../../../../models/authorizationServer";
import { ConsoleHeader } from "../../../../../models/console/consoleHeader";
import { ApiService } from "../../../../../services/apiService";
import { GraphQLTreeNode, GraphQLOutputTreeNode, GraphQLInputTreeNode, getType } from "./graphql-utilities/graphql-node-models";
import { setupGraphQLQueryIntellisense } from "./graphql-utilities/graphqlUtils";
import { KnownMimeTypes } from "../../../../../models/knownMimeTypes";
import { ISettingsProvider } from "@paperbits/common/configuration";
import { ResponsePackage } from "./responsePackage";
import { Utils } from "../../../../../utils";
import { GraphDocService } from "./graphql-documentation/graphql-doc-service";
import { LogItem, WebsocketClient } from "./websocketClient";
import * as _ from "lodash";

@Component({
    selector: "graphql-console",
    template: template,
    childTemplates: {
        graphqlExplorer: graphqlExplorer,
    }
})
export class GraphqlConsole {

    private operationNodes: {
        query: ko.Observable<GraphQLTreeNode>,
        mutation: ko.Observable<GraphQLTreeNode>,
        subscription: ko.Observable<GraphQLTreeNode>
    }

    private globalNodes: ko.ObservableArray<GraphQLTreeNode>

    private schema: string;
    public filter: ko.Observable<string>;

    private queryEditor: monaco.editor.IStandaloneCodeEditor;
    private variablesEditor: monaco.editor.IStandaloneCodeEditor;
    private responseEditor: monaco.editor.IStandaloneCodeEditor;

    private onContentChangeTimoutId: number = undefined;
    private editorUpdate: boolean = true;

    public readonly document: ko.Observable<string>;
    public readonly sendingRequest: ko.Observable<boolean>;
    public readonly working: ko.Observable<boolean>;
    public readonly collapsedExplorer: ko.Observable<boolean>;
    public readonly collapsedHeaders: ko.Observable<boolean>;
    public readonly headers: ko.ObservableArray<ConsoleHeader>;
    public readonly requestError: ko.Observable<string>;
    public readonly variables: ko.Observable<string>;
    public readonly response: ko.Observable<string>;
    public readonly isContentValid: ko.Observable<boolean>;
    public readonly contentParseErrors: ko.Observable<string>;
    public backendUrl: string;

    public readonly isSubscriptionOperation: ko.Observable<boolean>;

    public readonly wsConnected: ko.Observable<boolean>;
    public readonly wsProcessing: ko.Observable<boolean>;
    private ws: WebsocketClient;
    public readonly wsLogItems: ko.ObservableArray<object>;
    public readonly lastViewedNotifications: ko.Observable<number>;
    

    constructor(
        private readonly routeHelper: RouteHelper,
        private readonly apiService: ApiService,
        private readonly httpClient: HttpClient,
        private readonly settingsProvider: ISettingsProvider,
        private readonly graphDocService: GraphDocService
    ) {
        this.working = ko.observable(true);
        this.collapsedExplorer = ko.observable(true);
        this.collapsedHeaders = ko.observable(true);
        this.requestError = ko.observable();
        this.api = ko.observable<Api>();
        this.sendingRequest = ko.observable(false);
        this.authorizationServer = ko.observable();
        this.headers = ko.observableArray();
        this.document = ko.observable();
        this.operationUrl = ko.observable();
        this.variables = ko.observable();
        this.response = ko.observable();
        this.filter = ko.observable("");
        this.isContentValid = ko.observable(true);
        this.contentParseErrors = ko.observable(null);
        this.useCorsProxy = ko.observable(true);

        this.operationNodes = {
            query: ko.observable(),
            mutation: ko.observable(),
            subscription: ko.observable()
        }
        this.globalNodes = ko.observableArray([]);

        this.isSubscriptionOperation = ko.observable(false);

        this.wsConnected = ko.observable(false);
        this.wsProcessing = ko.observable(false);
        this.lastViewedNotifications = ko.observable();
        this.wsLogItems = ko.observableArray([]);
    }

    @Param()
    public api: ko.Observable<Api>;

    @Param()
    public operationUrl: ko.Observable<string>;

    @Param()
    public authorizationServer: ko.Observable<AuthorizationServer>;

    @Param()
    public useCorsProxy: ko.Observable<boolean>;

    @OnMounted()
    public async initialize(): Promise<void> {
        await this.resetConsole();
        await this.loadingMonaco();
        //this.queryType.subscribe(this.onQueryTypeChange);
        this.document.subscribe(this.onDocumentChange);
        this.response.subscribe(this.onResponseChange);
        this.backendUrl = await this.settingsProvider.getSetting<string>("backendUrl");
    }

    private async resetConsole(): Promise<void> {
        const selectedApi = this.api();

        if (!selectedApi) {
            return;
        }

        this.working(true);
        this.sendingRequest(false);

        let defaultHeader = new ConsoleHeader();
        defaultHeader.name("Content-Type");
        defaultHeader.value("application/json");
        this.headers.push(defaultHeader);

        const graphQLSchemas = await this.apiService.getSchemas(this.api());
        this.schema = graphQLSchemas.value.find(s => s.graphQLSchema)?.graphQLSchema;
        await this.buildTree(this.schema);
        this.availableOperations();
        this.selectByDefault();
        this.working(false);
    }

    public getApiReferenceUrl(): string {
        return this.routeHelper.getApiReferenceUrl(this.api().name);
    }

    private selectByDefault(): void {
        const type = this.graphDocService.currentSelected()[GraphqlCustomFieldNames.type]();
        this.operationNodes[type]().toggle(true);

        //this.onQueryTypeChange(GraphqlTypesForDocumentation[type]);
        const name = this.graphDocService.currentSelected()['name'];

        for (let child of this.operationNodes[type]().children()) {
            if(child.label() === name) {
                child.toggle();
                break;
            }
        }
        this.generateDocument();
    }

    private onDocumentChange(document: string): void {
        if (this.editorUpdate) {
            this.queryEditor.setValue(document);
        }
        this.editorUpdate = true;
        this.isSubscriptionOperation(document.trim().startsWith(GraphqlTypes.subscription));
    }

    private onResponseChange(response: string): void {
        this.responseEditor.setValue(Utils.formatJson(response));
    }

    documentToTree() {
        try {
            const ast = GraphQL.parse(this.document(), { noLocation: true });
            for (let node of this.globalNodes()) {
                node?.clear();
                node?.toggle(true, false);
            }
            let curNode: GraphQLTreeNode;
            let variables = [];

            // Go through every node in a new generated parsed graphQL, associate the node with the created tree from init and toggle checkmark.
            GraphQL.visit(ast, {
                enter: node => {
                    if (node.kind === GraphQL.Kind.OPERATION_DEFINITION) {
                        variables = [];
                        curNode = this.globalNodes().find(mainNode => mainNode.label() == node.operation);
                    } else if (node.kind === GraphQL.Kind.FIELD || node.kind === GraphQL.Kind.ARGUMENT 
                        || node.kind === GraphQL.Kind.OBJECT_FIELD || node.kind === GraphQL.Kind.INLINE_FRAGMENT) {
                        let targetNode: GraphQLTreeNode;
                        if (node.kind === GraphQL.Kind.FIELD) {
                            targetNode = curNode.children().find(n => !n.isInputNode() && n.label() === node.name.value);
                        } else if (node.kind === GraphQL.Kind.INLINE_FRAGMENT) {
                            targetNode = curNode.children().find(n => !n.isInputNode() && n.label() === node.typeCondition.name.value);
                        } else {
                            let inputNode = <GraphQLInputTreeNode>curNode.children().find(n => n.isInputNode() && n.label() === node.name.value);
                            if (node.value.kind === GraphQL.Kind.STRING) {
                                inputNode.inputValue(`"${node.value.value}"`);
                            } else if (node.value.kind === GraphQL.Kind.BOOLEAN || node.value.kind === GraphQL.Kind.INT 
                                || node.value.kind === GraphQL.Kind.FLOAT || node.value.kind === GraphQL.Kind.ENUM) {
                                inputNode.inputValue(`${node.value.value}`);
                            } else if (node.value.kind === GraphQL.Kind.VARIABLE) {
                                inputNode.inputValue(`$${node.value.name.value}`);
                            }
                            targetNode = inputNode;
                        }
                        if (targetNode) {
                            curNode = targetNode;
                            curNode.toggle(true, false);
                        }
                    } else if (node.kind === GraphQL.Kind.VARIABLE_DEFINITION && 
                        (node.type.kind === GraphQL.Kind.NAMED_TYPE || node.type.kind === GraphQL.Kind.NON_NULL_TYPE)) {
                        let typeString;
                        if (node.type.kind === GraphQL.Kind.NON_NULL_TYPE && node.type.type.kind === GraphQL.Kind.NAMED_TYPE) {
                            typeString = `${node.type.type.name.value}!`;
                        } else if (node.type.kind === GraphQL.Kind.NAMED_TYPE) {
                            typeString = node.type.name.value;
                        }
                        variables.push({
                            name: node.variable.name.value,
                            type: typeString
                        });
                    }
                },
                leave: node => {
                    if (curNode && (node.kind === GraphQL.Kind.FIELD || node.kind === GraphQL.Kind.ARGUMENT 
                        || node.kind === GraphQL.Kind.OBJECT_FIELD || node.kind === GraphQL.Kind.INLINE_FRAGMENT 
                        || node.kind === GraphQL.Kind.OPERATION_DEFINITION)) {
                        if (node.kind === GraphQL.Kind.OPERATION_DEFINITION) {
                            (<GraphQLOutputTreeNode>curNode).variables = variables;
                        }
                        if(!(node.kind === GraphQL.Kind.FIELD && node.name.value === GraphqlMetaField.typename))
                            curNode = curNode.parent();
                    }
                }
            });
        } catch (err) {
            // Do nothing here as the doc is invalidated
            return;
        }
    }

    private tryParseGraphQLSchema(document: string): void {
        try {
            GraphQL.parse(document);
        }
        catch (error) {
            this.isContentValid(false);

            const message = error.message;
            const location = error.locations.shift();

            const position = !!location
                ? ` Line: ${location.line}. Column: ${location.column}.`
                : "";

            this.contentParseErrors(`${message}${position}`);
        }
    }

    public removeHeader(header: ConsoleHeader): void {
        this.headers.remove(header);
    }

    public addHeader(): void {
        this.headers.push(new ConsoleHeader());
    }

    public async validateAndSendRequest(): Promise<void> {
        const headers = this.headers();
        const parameters = [].concat(headers);
        const validationGroup = validation.group(parameters.map(x => x.value), { live: true });
        const clientErrors = validationGroup();

        if (clientErrors.length > 0) {
            validationGroup.showAllMessages();
            return;
        }

        this.sendRequest();
    }

    private async sendRequest(): Promise<void> {
        this.requestError(null);
        this.sendingRequest(true);

        let payload: string;
        payload = JSON.stringify({
            query: this.document(),
            variables: this.variables() && this.variables().length > 0 ? JSON.parse(this.variables()) : null
        })

        const request: HttpRequest = {
            url: this.operationUrl(),
            method: "POST",
            headers: this.addSystemHeaders(),
            body: payload
        };

        try {
            let response;
            if (this.useCorsProxy()) {
                response = await this.sendFromProxy(request);
            }
            else {
                response = await this.sendFromBrowser(request);
            }
            const responseStr = Buffer.from(response.body.buffer).toString();
            this.response(responseStr);

            //Remove this example
            // if(this.wsConnected() && this.queryType() == GraphqlTypesForDocumentation.mutation) {
            //     let datetime = new Date()
            //     this.wsLogItems.push({
            //         "logData": this.response(),
            //         "logTime": datetime.toLocaleTimeString(),
            //         "logType": "GetData"
            //     })
            // }
        }
        catch (error) {
            if (error.code && error.code === "RequestError") {
                this.requestError(`Since the browser initiates the request, it requires Cross-Origin Resource Sharing (CORS) enabled on the server. <a href="https://aka.ms/AA4e482" target="_blank">Learn more</a>`);
            }
        }
        finally {
            this.sendingRequest(false);
        }
    }

    private addSystemHeaders() {
        return this.headers().map(x => { return { name: x.name(), value: x.value() ?? "" }; }).filter(x => !!x.name && !!x.value);
    }

    public async sendFromProxy<T>(request: HttpRequest): Promise<HttpResponse<T>> {
        if (request.body) {
            request.body = Buffer.from(request.body);
        }

        const formData = new FormData();
        const requestPackage = new Blob([JSON.stringify(request)], { type: KnownMimeTypes.Json });
        formData.append("requestPackage", requestPackage);

        const baseProxyUrl = this.backendUrl || "";
        const apiName = this.api().name;

        const proxiedRequest: HttpRequest = {
            url: `${baseProxyUrl}/send`,
            method: "POST",
            headers: [{ name: "X-Ms-Api-Name", value: apiName }],
            body: formData
        };

        const proxiedResponse = await this.httpClient.send<ResponsePackage>(proxiedRequest);
        const responsePackage = proxiedResponse.toObject();

        const responseBodyBuffer = responsePackage.body
            ? Buffer.from(responsePackage.body.data)
            : null;

        const response: any = {
            headers: responsePackage.headers,
            statusCode: responsePackage.statusCode,
            statusText: responsePackage.statusMessage,
            body: responseBodyBuffer,
            toText: () => responseBodyBuffer.toString("utf8")
        };

        return response;
    }

    public async sendFromBrowser<T>(request: HttpRequest): Promise<HttpResponse<T>> {
        const response = await this.httpClient.send<any>(request);
        return response;
    }

    public loadingMonaco() {
        loader.config({ paths: { vs: "/assets/monaco-editor/vs" } });
        loader.init().then(monaco => {
            this.initEditor(VariablesEditorSettings, this.variables);
            this.initEditor(ResponseSettings, this.response);
            this.initEditor(QueryEditorSettings, this.document);
        });
    }

    private initEditor(editorSettings, editorValue: ko.Observable<string>): void {

        if (editorSettings.id === QueryEditorSettings.id) {
            setupGraphQLQueryIntellisense(this.schema);
        }

        let formattedEditorValue = editorValue();

        if (editorSettings.id === ResponseSettings.id) {
            formattedEditorValue = Utils.formatJson(formattedEditorValue);
        }

        const defaultSettings = {
            value: formattedEditorValue || "",
            contextmenu: false,
            lineHeight: 17,
            automaticLayout: true,
            minimap: {
                enabled: false
            }
        };

        let settings = { ...defaultSettings, ...editorSettings.config }

        this[editorSettings.id] = (<any>window).monaco.editor.create(document.getElementById(editorSettings.id), settings);

        this[editorSettings.id].onDidChangeModelContent((e) => {
            if (!e.isFlush) {
                const value = this[editorSettings.id].getValue();
                if (editorSettings.id === QueryEditorSettings.id) {
                    this.isContentValid(true);
                    this.contentParseErrors(null);
                    clearTimeout(this.onContentChangeTimoutId);
                    this.onContentChangeTimoutId = window.setTimeout(async () => {
                        // if(this.isSubscription() && this.wsConnected()) {
                        //     await this.closeWsConnection(true);
                        // }
                        this.tryParseGraphQLSchema(value);
                        if (this.isContentValid()) {
                            this.editorUpdate = false;
                            this.document(value);
                        }
                        this.documentToTree();
                    }, 500)
                }
                if (editorSettings.id === VariablesEditorSettings.id) {
                    this.variables(value);
                }
            }
        });
    }

    private buildTree(content: string): void {
        const schema = GraphQL.buildSchema(content);

        this.operationNodes.query(new GraphQLOutputTreeNode(GraphqlTypes.query, <GraphQL.GraphQLField<any, any>>{
            type: schema.getQueryType(),
            args: []
        }, () => this.generateDocument(), null));

        this.operationNodes.mutation(new GraphQLOutputTreeNode(GraphqlTypes.mutation, <GraphQL.GraphQLField<any, any>>{
            type: schema.getMutationType(),
            args: []
        }, () => this.generateDocument(), null));

        this.operationNodes.subscription(new GraphQLOutputTreeNode(GraphqlTypes.subscription, <GraphQL.GraphQLField<any, any>>{
            type: schema.getSubscriptionType(),
            args: []
        }, () => this.generateDocument(), null));
    }

    public generateDocument() {
        const document = `${this.createFieldStringFromNodes(this.globalNodes(), 0)}`;
        this.document(document);
    }

    /**
     * 
     * @param nodes list of root nodes to generate from
     * @param level level for indent
     * @returns string of generated node, for example:
     * {
     *    dragon
     * }
     */
    private createFieldStringFromNodes(nodes: GraphQLTreeNode[], level: number): string {
        let selectedNodes: string[] = [];
        for (let node of nodes) {
            let inputNodes: GraphQLInputTreeNode[] = []
            let outputNodes: GraphQLTreeNode[] = [];
            for (let child of node.children()) {
                if (child instanceof GraphQLInputTreeNode) {
                    inputNodes.push(child);
                } else {
                    outputNodes.push(child);
                }
            }
            if (this.checkingGeneration(node)) {
                const parentType = getType(node.parent()?.data?.type);
                const nodeName = (parentType instanceof GraphQL.GraphQLUnionType) ? `... on ${node.label()}` : node.label();
                if (level === 0) {
                    selectedNodes.push(nodeName + this.createVariableString(<GraphQLOutputTreeNode>node) + this.createFieldStringFromNodes(outputNodes, level + 1));
                } else {
                    selectedNodes.push(nodeName + this.createArgumentStringFromNode(inputNodes, true) + this.createFieldStringFromNodes(outputNodes, level + 1));
                }
            }
        }
        selectedNodes = selectedNodes.map(node => "\t".repeat(level) + node);
        let result: string;
        if (selectedNodes.length === 0) {
            result = "";
        } else {
            if (level === 0) {
                result = selectedNodes.join("\n\n");
            } else {
                result = ` {\n${selectedNodes.join("\n")}\n${"\t".repeat(level - 1)}}`
            }
        }
        return result;
    }

    

    private checkingGeneration(node: GraphQLTreeNode): boolean {
        const isOperation = _.includes([GraphqlTypes.query, GraphqlTypes.mutation, GraphqlTypes.subscription], node.label());
        if((node.selected() && !isOperation) || (node.selected() && isOperation && node.hasActiveChild())) {
            return true;
        }
        return false;
    }

    // private thereIsSelectedChild(children: GraphQLTreeNode[]): boolean {
    //     if(children.length > 0) {
    //         for (const child of children) {
    //             if(child.selected()) {
    //                 return true;
    //             }
    //         }
    //     }
    //     return false;
    // }

    /**
    * 
    * @param node root node, either query, mutation, or subscription
    * @returns list of variable as string to parse in document. For example, ($lim: Int!)
    */
    private createVariableString(node: GraphQLOutputTreeNode): string {
        if (node.variables.length > 0) {
            return "(" + node.variables.map(v => `$${v.name}: ${v.type}`).join(", ") + ")";
        }
        return "";
    }

    /**
     * Example: (limit: 10)
     * @param nodes list of root nodes to generate from
     * @param firstLevel true if this is the first level of object argument ({a: {b: 2}})
     * @returns string of argument of the declaration. For example, (a : 1)
     */
    private createArgumentStringFromNode(nodes: GraphQLInputTreeNode[], firstLevel: boolean): string {
        let selectedNodes: string[] = [];
        for (let node of nodes) {
            if (node.selected()) {
                let type = getType(node.data.type);
                if (node.isScalarType() || node.isEnumType()) {
                    selectedNodes.push(`${node.label()}: ${node.inputValue()}`);
                } else if (type instanceof GraphQL.GraphQLInputObjectType) {
                    selectedNodes.push(`${node.label()}: { ${this.createArgumentStringFromNode(node.children(), false)} }`)
                }
            }
        }
        return selectedNodes.length > 0 ? (firstLevel ? `(${selectedNodes.join(", ")})` : selectedNodes.join(", ")) : "";
    }

    public gqlFieldName(name: string, isRequired: boolean, isInputNode: boolean): string {
        let gqlFieldName = name += (isRequired && isInputNode) ? '*' : '';
        gqlFieldName = gqlFieldName += (isInputNode) ? ':' : '';
        return gqlFieldName;
    }

    public collapse(collapsible: string): void {
        this[collapsible](!this[collapsible]());
    }

    private availableOperations(): void {
        _.forEach(this.graphDocService.availableTypes(), (type) => {
            const node = this.operationNodes[this.graphDocService.typeIndexer()[type]]();
            node.toggle(true);
            this.globalNodes.push(node);
        })
    }

    public getOperationNode(type : string) {
        return this.operationNodes[this.graphDocService.typeIndexer()[type]]();
    }

    // public typeChange(type: string): void {
    //     this.fromTabChange(true);
    //     if(this.isSubscription() && type != GraphqlTypesForDocumentation.subscription) {
    //         this.lastViewedNotifications(this.wsLogItems().length);
    //         this.queryType(type);
    //         this.initEditor(ResponseSettings, this.response);
    //     }
    //     else 
    //         this.queryType(type);
    // }

    public notifications(): number {
        return (this.lastViewedNotifications()) ? this.wsLogItems().length - this.lastViewedNotifications(): 0;
    }

    public displayWsConsole(): boolean {
        return this.wsProcessing() || this.wsConnected();
    }

    public closeConnections(): void {
        if(this.wsConnected()) {
            this.closeWsConnection();
        }
    }

    public async closeWsConnection(queryChanged = false): Promise<void> {
        this.wsProcessing(true);

        //TODO close the websocket connection
        let datetime = new Date();
        if(queryChanged) {
            this.wsLogItems.push({
                "logTime": datetime.toLocaleTimeString(),
                "logData": "Disconnecting: Subscription Query has been updated",
                "logType": "Connection"
            })
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
        datetime = new Date();
        this.wsLogItems.push({
            "logTime": datetime.toLocaleTimeString(),
            "logData": "Disconnected",
            "logType": "Connection"
        })
        
        this.wsProcessing(false);
        this.wsConnected(false);
    }

    public async wsConnect(): Promise<void> {
        this.wsProcessing(true);

        //TODO Implement ws connection
        let datetime = new Date();
        this.wsLogItems.push({
            "logTime": datetime.toLocaleTimeString(),
            "logData": "Connecting to wss://jbtests-apimanagement.azure-api.net/",
            "logType": "Connection"
        });
        this.wsLogItems.push({
            "logTime": datetime.toLocaleTimeString(),
            "logData": this.document(),
            "logType": "SendData"
        });
        await new Promise(resolve => setTimeout(resolve, 1000));
        datetime = new Date();
        this.wsLogItems.push({
            "logTime": datetime.toLocaleTimeString(),
            "logData": "Connected",
            "logType": "Connection"
        });

        this.wsProcessing(false);
        this.wsConnected(true);
    }

    public clearLogs(): void {
        this.wsLogItems([]);
        //this.ws?.clearLogs();
    }

    
}