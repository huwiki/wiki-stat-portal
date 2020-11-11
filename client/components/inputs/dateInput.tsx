import { DateInput as BpDateInput } from "@blueprintjs/datetime";
import moment from "moment";
import * as React from "react";
import { Input, InputProps } from "./input";

export interface DateInputProps extends InputProps {
	value: Date;
	setValue: (newValue: Date) => void;
	minDate?: Date;
	maxDate?: Date;
}

export class DateInput extends Input<DateInputProps> {
	public get inputType(): string {
		return "dateInput";
	}

	protected renderInput(): JSX.Element {
		return <BpDateInput
			inputProps={{ readOnly: true }}
			minDate={this.props.minDate}
			maxDate={this.props.maxDate}
			parseDate={() => false}
			formatDate={date => moment(date).format("yyyy. MMMM D.")}
			value={this.props.value}
			onChange={this.onChange}
		/>;
	}

	private onChange = (selectedDate: Date) => {
		this.props?.setValue(selectedDate);
	}
}
