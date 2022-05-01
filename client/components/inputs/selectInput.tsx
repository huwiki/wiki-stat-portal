import { Classes, Icon, MenuItem } from "@blueprintjs/core";
import { IItemRendererProps, Select } from "@blueprintjs/select";
import * as classnames from "classnames";
import { observer } from "mobx-react";
import * as React from "react";
import { InputProps, InputWrapper } from "./inputWrapper";

export interface SelectInputProps<T> extends Omit<InputProps, "inputType"> {
	items: T[];
	value: T | undefined;
	setValue: (newValue: T) => void;
	itemKeySelector: (element: T) => string;
	itemRenderer: (element: T) => React.ReactNode;
	itemPredicate?: (query: string, element: T) => boolean;
	noSelectedItemsLabel?: string;
	noSearchResultsLabel?: string;
	filterLabel?: string;
	disabled?: boolean;
}

@observer
export class SelectInput<T> extends React.Component<SelectInputProps<T>> {
	public get inputType(): string {
		return "selectInput";
	}

	public render(): JSX.Element {
		const inputGroupClasses = {
			[Classes.INPUT_GROUP]: true,
			[Classes.FILL]: true
		};
		const inputClasses = {
			[Classes.INPUT]: true,
			[Classes.FILL]: true
		};
		if (this.props.disabled) {
			inputGroupClasses[Classes.DISABLED] = true;
			inputClasses[Classes.DISABLED] = true;
		}

		const selectLabel = this.props.value != null
			? this.props.itemRenderer(this.props.value)
			: this.props.noSelectedItemsLabel;

		return <InputWrapper
			inputType="selectInput"
			inputClassName={this.props.inputClassName}
			inputLabel={this.props.inputLabel}
		>
			<Select
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
						{selectLabel}
					</div>
					<Icon icon="caret-down" />
				</div>
			</Select>
		</InputWrapper>;
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
