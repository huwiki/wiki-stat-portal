import { DateInput as BpDateInput } from "@blueprintjs/datetime";
import moment from "moment";
import * as React from "react";
import { Input, InputProps } from "./input";

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

export interface DateInputProps extends InputProps {
	value: Date;
	setValue: (newValue: Date) => void;
	minDate?: Date;
	maxDate?: Date;
	localizationProvider?: DateInputLocaliztaionProvider;
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
			formatDate={date => moment(date).format("LL")}
			localeUtils={
				this.props.localizationProvider && {
					...this.props.localizationProvider,
					formatDate: () => "",
					parseDate: () => new Date(),
				}}
			value={this.props.value}
			onChange={this.onChange}
		/>;
	}

	private onChange = (selectedDate: Date) => {
		this.props?.setValue(selectedDate);
	}
}
