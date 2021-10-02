import { Logger } from "winston";
import { AppRunningContext } from "../../server/appRunningContext";

const runTool = async (): Promise<void> => {
	let logger: Logger | null = null;
	try {
		const appCtx = AppRunningContext.getInstance("dataCacher");
		logger = appCtx.logger;


	}
	catch (err) {
		if (logger) {
			logger.error({
				errorMessage: "[configurationValidator] Error while validating configurations",
				error: err
			});
		} else {
			console.log(err, "error");
		}
		process.exit(1);
	}
};

runTool();
