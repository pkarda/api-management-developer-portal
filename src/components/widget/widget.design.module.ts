import { IInjectorModule, IInjector } from "@paperbits/common/injection";
import { WidgetEditor } from "./ko/widgetEditor";
import { WidgetHandlers } from "./widgetHandlers";
import { Widget, WidgetViewModelBinder } from "./ko";
import { WidgetModelBinder } from ".";


export class WidgetDesignModule implements IInjectorModule {
    public register(injector: IInjector): void {
        injector.bind("widget", Widget);
        injector.bind("widgetEditor", WidgetEditor);
        injector.bindToCollection("modelBinders", WidgetModelBinder);
        injector.bindToCollection("viewModelBinders", WidgetViewModelBinder);


        /**
         * Here we can load custom widget configurations from a blob storage. For example, it could be some kind of registry: `/custom-code/registry.json`.
         */

        injector.bindInstanceToCollection("widgetHandlers", new WidgetHandlers({
            name: "widget1",
            displayName: "Custom widget 1",
            category: "Advanced",
            iconUrl: "https://...",
            defaultConfig: { field1: "bla-bla", field2: "bla-bla" }
        }));

        injector.bindInstanceToCollection("widgetHandlers", new WidgetHandlers({
            name: "widget2",
            displayName: "Custom widget 2",
            category: "Advanced",
            iconUrl: "https://...",
            defaultConfig: { field1: "bla-bla", field2: "bla-bla" }
        }));
    }
}