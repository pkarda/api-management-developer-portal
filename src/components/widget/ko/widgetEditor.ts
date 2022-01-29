import template from "./widgetEditor.html";
import { Component, OnMounted, Param, Event } from "@paperbits/common/ko/decorators";
import { WidgetModel } from "../widgetModel";


@Component({
    selector: "custom-widget-editor",
    template: template
})
export class WidgetEditor {
    constructor() {
    }

    @Param()
    public model: WidgetModel;

    @Event()
    public onChange: (model: WidgetModel) => void;

    @OnMounted()
    public async initialize(): Promise<void> {
    }

    private applyChanges(): void {
        this.onChange(this.model);
    }
}