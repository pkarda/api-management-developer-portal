import { IWidgetOrder, IWidgetHandler } from "@paperbits/common/editing";
import { WidgetConfiguration } from "./widgetConfiguration";
import { WidgetModel } from "./widgetModel";


export class WidgetHandlers implements IWidgetHandler {
    constructor(private readonly configuration: WidgetConfiguration) { }

    public async getWidgetOrder(): Promise<IWidgetOrder> {
        const widgetOrder: IWidgetOrder = {
            name: this.configuration.name,
            displayName: this.configuration.displayName,
            category: this.configuration.category,
            iconClass: "widget-icon widget-icon-component",
            // iconUrl: this.configuration.iconUrl,
            requires: [],
            createModel: async () => {
                const model = new WidgetModel();
                model.widgetName = this.configuration.name;
                model.widgetDisplayName = this.configuration.displayName;
                model.widgetConfig = this.configuration.defaultConfig;;
                return model;
            }
        };

        return widgetOrder;
    }
}