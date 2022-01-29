import { Contract } from "@paperbits/common";

export interface WidgetContract extends Contract {
    /**
     * This name is used to identify which widget to load into iframe.
     */
    widgetName: string;

    /**
     * @deprecated. This name will be shown in editors and widget selector. (this will be removed from here and used only in WidgetHandlers)
     */
    widgetDisplayName: string;

    /**
     * This is widget configuration that you pass into iframe that hosts the widget.
     */
    widgetConfig: unknown;
}