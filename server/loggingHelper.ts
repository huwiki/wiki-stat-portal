import winston, { format } from "winston";
import DailyRotateFile from "winston-daily-rotate-file";

export const createWikiStatLogger = (loggerId: string): winston.Logger => {
	return winston.loggers.get(loggerId, {
		level: "info",
		transports: [
			new winston.transports.Console({
				format: format.combine(
					format.errors({ stack: true }),
					format.timestamp(),
					format.colorize(),
					format.prettyPrint(),
					format.printf(info => {
						if (info.stack) {
							return `[${info.timestamp}] ${info.level}: ${info.message}; ${info.stack}`;
						}

						return `[${info.timestamp}] ${info.level}: ${info.message}`;
					})
				)
			}),
			new DailyRotateFile({
				datePattern: "YYYY-MM-DD",
				filename: "log-%DATE%.txt",
				utc: true,
				dirname: `./logs/${loggerId}`,
				maxFiles: 15,
				format: format.combine(
					format.errors({ stack: true }),
					format.timestamp(),
					format.printf(info => {
						if (info.stack) {
							return `[${info.timestamp}] ${info.level}: ${info.message}; ${info.stack}`;
						}

						return `[${info.timestamp}] ${info.level}: ${info.message}`;
					})
				),
			})
		],
	});
};
