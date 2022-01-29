import { IInjectorModule, IInjector } from "@paperbits/common/injection";
import { Widget } from "./ko/widget";
import { WidgetModelBinder } from "./widgetModelBinder";
import { WidgetViewModelBinder } from "./ko/widgetViewModelBinder";


export class WidgetPublishModule implements IInjectorModule {
    public register(injector: IInjector): void {        
        injector.bind("widget", Widget);
        injector.bindToCollection("modelBinders", WidgetModelBinder);
        injector.bindToCollection("viewModelBinders", WidgetViewModelBinder);
    }
}