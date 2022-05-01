import { InputGroup } from "@blueprintjs/core";
import { observer } from "mobx-react";
import * as React from "react";
import { InputProps, InputWrapper } from "./inputWrapper";

export interface TextInputProps extends Omit<InputProps, "inputType"> {
	value: string;
	setValue: (newValue: string) => void;
}

@observer
export class TextInput extends React.Component<TextInputProps> {
	public render(): JSX.Element {
		return <InputWrapper
			inputType="textInput"
			inputClassName={this.props.inputClassName}

		>
			<InputGroup
				value={this.props.value}
				onChange={this.onChange}
			/>
		</InputWrapper>;
	}

	private onChange = (event: React.FormEvent<HTMLInputElement>) => {
		this.props?.setValue((event.target as HTMLInputElement).value);
	}
}
