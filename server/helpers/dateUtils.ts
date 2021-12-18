import moment from "moment";

export const momentToNumberArray = (date: moment.Moment): number[] => {
	return [
		date.year(),
		date.month(),
		date.date(),
		date.hours(),
		date.minutes(),
		date.seconds()
	];
};
