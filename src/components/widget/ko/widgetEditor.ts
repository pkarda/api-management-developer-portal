import * as ko from "knockout";
import template from "./widgetEditor.html";
import { Component, OnMounted, Param, Event, OnDestroyed } from "@paperbits/common/ko/decorators";
import { WidgetModel } from "../widgetModel";


@Component({
    selector: "custom-widget-editor",
    template: template
})
export class WidgetEditor {
    public srcdoc: ko.Observable<string>;

    constructor() {
        /* TODO: This editor application will be loaded from URL.
         * For instance: /custom-code/my-widget-folder/editor/index.html
        */
        this.srcdoc = ko.observable(`
            <html>
            <head>
                <script>
                    let count = 0;
                    function applyChanges() {
                        count++;
                        parent.postMessage({ count: count }, "*");
                    }
                </script>
            </head>
            <body>
                <button onclick="applyChanges()">Increase count</button>
            </body>
            </html>
        `);
    }

    @Param()
    public model: WidgetModel;

    @Event()
    public onChange: (model: WidgetModel) => void;

    private applyChanges(event: MessageEvent): void {
        this.model.widgetConfig = event.data;
        this.onChange(this.model);
    }

    @OnMounted()
    public initialize(): void {
        addEventListener("message", this.applyChanges);

        /**
         * Here we can also send message to iframe in order to initialize it. Something like this:
         * iframeElement.contentWindow.postMessage(this.model.widgetConfig);
         */
    }

    @OnDestroyed()
    public dispose(): void {
        removeEventListener("message", this.applyChanges);
    }
}