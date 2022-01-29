import * as ko from "knockout";
import template from "./widget.html";
import { Component } from "@paperbits/common/ko/decorators";


@Component({
    selector: "custom-widget",
    template: template
})
export class Widget {
    public readonly widgetName: ko.Observable<string>;
    public readonly widgetConfig: ko.Observable<string>;

    constructor() {
        this.widgetName = ko.observable();
        this.widgetConfig = ko.observable();

        /**
         * Here we use widget name to identify which custom widget to load into the iframe, 
         * and use widget config to serialize and pass it to the the iframe, i.e. like this:
         * <iframe src="../index.html?config=..."></iframe>
         */
    }
}
