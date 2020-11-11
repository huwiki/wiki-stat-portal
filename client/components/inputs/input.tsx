import * as classnames from "classnames";
import * as React from "react";
import inputStyles from "./input.module.scss";

export interface InputProps {
	inputLabel?: string;
	inputClassName?: string;
}

export abstract class Input<T extends InputProps> extends React.Component<T> {
	public render(): JSX.Element {
		return <div className={classnames("wspInput", `wspInput-${this.inputType}`, this.props.inputClassName)}>
			{this.props.inputLabel &&
				<div className={inputStyles.wspInputLabel}>
					{this.props.inputLabel}
				</div>}
			{this.renderInput()}
		</div>;
	}

	protected abstract get inputType(): string;
	protected abstract renderInput(): JSX.Element;
}
