import classnames from "classnames";
import * as React from "react";
import inputStyles from "./input.module.scss";

export interface InputProps {
	inputType: string;
	inputLabel?: string;
	inputClassName?: string;
}

export class InputWrapper extends React.Component<InputProps> {
	public render(): JSX.Element {
		const { inputType } = this.props;

		const classes = classnames("wspInput", `wspInput-${inputType}`, this.props.inputClassName);

		return <div className={classes} dir="ltr">
			{this.props.inputLabel &&
				<div className={classnames("wspInputLabel", inputStyles.wspInputLabel)}>
					{this.props.inputLabel}
				</div>}
			{this.props.children}
		</div>;
	}
}
