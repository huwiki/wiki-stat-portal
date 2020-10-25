import { InputGroup } from "@blueprintjs/core";
import * as React from "react";
import { Input, InputProps } from "./input";

export interface TextInputProps extends InputProps {
	value: string;
	setValue: (newValue: string) => void;
}

export class TextInput extends Input<TextInputProps> {
	public get inputType(): string {
		return "textInput";
	}

	protected renderInput(): JSX.Element {
		return <InputGroup
			value={this.props.value}
			onChange={this.onChange}
		/>;
	}

	private onChange = (event: React.FormEvent<HTMLInputElement>) => {
		this.props?.setValue((event.target as HTMLInputElement).value);
	}
}
