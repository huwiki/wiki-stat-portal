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
	itemPredicate?: (query: string, element: T) => boolean;
	noSelectedItemsLabel?: string;
	noSearchResultsLabel?: string;
	filterLabel?: string;
	disabled?: boolean;
}

export class SelectInput<T> extends Input<SelectInputProps<T>> {
	public get inputType(): string {
		return "selectInput";
	}

	public renderInput(): JSX.Element {
		const inputGroupClasses = [Classes.INPUT_GROUP, Classes.FILL];
		const inputClasses = [Classes.INPUT, Classes.FILL];
		if (this.props.disabled) {
			inputGroupClasses.push(Classes.DISABLED);
			inputClasses.push(Classes.DISABLED);
		}

		return <Select
			itemRenderer={this.renderSelectItem}
			items={this.props.items}
			onItemSelect={this.onItemSelect}
			noResults={<MenuItem disabled={true} text={this.props.noSearchResultsLabel} />}
			scrollToActiveItem
			filterable={typeof this.props.itemPredicate !== "undefined"}
			itemPredicate={this.props.itemPredicate}
			inputProps={{ placeholder: this.props.filterLabel }}
			popoverProps={{ minimal: true }}
			disabled={this.props.disabled}
		>
			<div className={classnames(inputGroupClasses)}>
				<div className={classnames(inputClasses)}>
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
