import { IModelBinder } from "@paperbits/common/editing";
import { WidgetModel } from "./widgetModel";
import { Contract } from "@paperbits/common";
import { WidgetContract } from "./widgetContract";


export class WidgetModelBinder implements IModelBinder<WidgetModel> {
    public canHandleContract(contract: Contract): boolean {
        console.log(contract.type);
        return contract.type === "customWidget";
    }

    public canHandleModel(model: WidgetModel): boolean {
        return model instanceof WidgetModel;
    }

    public async contractToModel(contract: WidgetContract): Promise<WidgetModel> {
        const model = new WidgetModel();
        model.widgetName = contract.widgetName;
        model.widgetDisplayName = contract.widgetDisplayName;
        model.widgetConfig = contract.widgetConfig;
        return model;
    }

    public modelToContract(model: WidgetModel): Contract {
        const contract: WidgetContract = {
            type: "customWidget",
            widgetName: model.widgetName,
            widgetDisplayName: model.widgetDisplayName,
            widgetConfig: model.widgetConfig
        };

        return contract;
    }
}
