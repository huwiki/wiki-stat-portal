import moment from "moment";
import DefaultErrorPage from "next/error";
import Head from "next/head";
import * as React from "react";
import { CommonPageProps } from "../../common/interfaces/commonPageProps";
import { DateInputLocaliztaionProvider } from "../components/inputs/dateInput";
import { I18nProvider } from "./i18nClient";

export abstract class NextBasePage<T extends CommonPageProps> extends React.Component<T> {
	protected i18nProvider: I18nProvider;

	protected t = (key: string): string => {
		return this.i18nProvider.t(key);
	}

	constructor(props: T) {
		super(props);
		this.i18nProvider = new I18nProvider(this.props.i18nData);
		moment.locale(this.props.languageCode);
	}

	protected render404Page(): JSX.Element {
		return <>
			<Head>
				<meta name="robots" content="noindex" />
			</Head>
			<DefaultErrorPage statusCode={404} title={this.t("pageNotFound")} />
		</>;
	}

	protected getDateInputLocalizationProvider(): DateInputLocaliztaionProvider {
		return {
			formatDay: (day: Date) => {
				return moment(day).format("LL");
			},
			formatMonthTitle: (date: Date) => {
				return moment(date).format("MMMM");
			},
			formatWeekdayShort: (day: number) => {
				const localeData = moment.localeData(this.props.languageCode);
				return localeData.weekdaysMin()[day];
			},
			formatWeekdayLong: (day: number) => {
				const localeData = moment.localeData(this.props.languageCode);
				return localeData.weekdays()[day];
			},
			getFirstDayOfWeek: () => {
				return 1;
			},
			getMonths: () => {
				const localeData = moment.localeData(this.props.languageCode);
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				return localeData.months() as any;
			},
		};
	}
}
