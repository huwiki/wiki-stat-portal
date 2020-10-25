import { Classes, Icon, MenuItem } from "@blueprintjs/core";
import { IItemRendererProps, Select } from "@blueprintjs/select";
import * as classnames from "classnames";
import * as React from "react";
import { Input, InputProps } from "./input";

export interface SelectInputProps<T> extends InputProps {
	items: T[];
	value: T;
	setValue: (newValue: T) => void;
	itemKeySelector: (element: T) => string;
	itemRenderer: (element: T) => React.ReactNode;
	noSelectedItemsLabel?: string;
	noSearchResultsLabel?: string;
}

export class SelectInput<T> extends Input<SelectInputProps<T>> {
	public get inputType(): string {
		return "selectInput";
	}

	public renderInput(): JSX.Element {
		return <Select
			itemRenderer={this.renderSelectItem}
			items={this.props.items}
			onItemSelect={this.onItemSelect}
			noResults={<MenuItem disabled={true} text={this.props.noSearchResultsLabel} />}
			scrollToActiveItem
			filterable={false}
			popoverProps={{ minimal: true }}
		>
			<div className={classnames(Classes.INPUT_GROUP, Classes.FILL)}>
				<div className={classnames(Classes.INPUT, Classes.FILL)}>
					{this.props.value
						? this.props.itemRenderer(this.props.value)
						: this.props.noSelectedItemsLabel}
				</div>
				<Icon icon="caret-down" />
			</div>
		</Select>;
	}

	private renderSelectItem = (item: T, itemProps: IItemRendererProps) => {
		return <MenuItem
			key={this.props.itemKeySelector(item)}
			text={this.props.itemRenderer(item)}
			onClick={itemProps.handleClick}
			disabled={itemProps.modifiers.disabled}
			active={itemProps.modifiers.active}
		/>;
	};

	private onItemSelect = (item: T) => {
		this.props?.setValue(item);
	}
}
