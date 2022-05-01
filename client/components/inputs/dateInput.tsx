import { DateInput as BpDateInput } from "@blueprintjs/datetime";
import moment from "moment";
import * as React from "react";
import { InputProps, InputWrapper } from "./inputWrapper";

export type DateInputLocaliztaionProvider = {
	formatDay(day: Date, locale?: string): string;
	formatMonthTitle(month: Date, locale?: string): string;
	formatWeekdayLong(weekday: number, locale?: string): string;
	formatWeekdayShort(weekday: number, locale?: string): string;
	getFirstDayOfWeek(locale?: string): number;
	getMonths(locale?: string): [
		string,
		string,
		string,
		string,
		string,
		string,
		string,
		string,
		string,
		string,
		string,
		string
	];
};

export interface DateInputProps extends Omit<InputProps, "inputType"> {
	value: Date;
	setValue: (newValue: Date) => void;
	minDate?: Date;
	maxDate?: Date;
	localizationProvider?: DateInputLocaliztaionProvider;
	disabled?: boolean;
}

export class DateInput extends React.Component<DateInputProps> {
	public render(): JSX.Element {
		return <InputWrapper
			inputType="dateInput"
			inputClassName={this.props.inputClassName}
			inputLabel={this.props.inputLabel}
		>
			<BpDateInput
				inputProps={{ readOnly: true }}
				minDate={this.props.minDate}
				maxDate={this.props.maxDate}
				parseDate={() => false}
				formatDate={date => moment(date).format("LL")}
				localeUtils={
					this.props.localizationProvider && {
						...this.props.localizationProvider,
						formatDate: () => "",
						parseDate: () => new Date(),
					}}
				value={this.props.value}
				onChange={this.onChange}
				disabled={this.props.disabled}
				canClearSelection={false}
			/>
		</InputWrapper>;
	}

	private onChange = (selectedDate: Date) => {
		this.props?.setValue(selectedDate);
	}
}
