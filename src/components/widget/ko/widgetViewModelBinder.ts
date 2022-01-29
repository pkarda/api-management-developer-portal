import { Bag } from "@paperbits/common";
import { EventManager, Events } from "@paperbits/common/events";
import { ComponentFlow, IWidgetBinding } from "@paperbits/common/editing";
import { ViewModelBinder } from "@paperbits/common/widgets";
import { Widget } from "./widget";
import { WidgetModel } from "../widgetModel";


export class WidgetViewModelBinder implements ViewModelBinder<WidgetModel, Widget>  {
    constructor(private readonly eventManager: EventManager) { }

    public async updateViewModel(model: WidgetModel, viewModel: Widget): Promise<void> {
        viewModel.widgetName(model.widgetName);
        viewModel.widgetConfig(JSON.stringify(model.widgetConfig));
    }

    public async modelToViewModel(model: WidgetModel, viewModel?: Widget, bindingContext?: Bag<any>): Promise<Widget> {
        if (!viewModel) {
            viewModel = new Widget();

            const binding: IWidgetBinding<WidgetModel, Widget> = {
                name: model.widgetName,
                displayName: model.widgetDisplayName,
                readonly: bindingContext?.readonly,
                model: model,
                draggable: true,
                flow: ComponentFlow.Block,
                editor: "custom-widget-editor",
                applyChanges: async () => {
                    await this.updateViewModel(model, viewModel);
                    this.eventManager.dispatchEvent(Events.ContentUpdate);
                }
            };
            viewModel["widgetBinding"] = binding;
        }

        this.updateViewModel(model, viewModel);

        return viewModel;
    }

    public canHandleModel(model: WidgetModel): boolean {
        return model instanceof WidgetModel;
    }
}