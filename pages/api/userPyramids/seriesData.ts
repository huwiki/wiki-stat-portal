import { isArray } from "lodash";
import { NextApiRequest, NextApiResponse } from "next";
import { moduleManager } from "../../../server/modules/moduleManager";
import { UserPyramidsModule } from "../../../server/modules/userPyramidsModule/userPyramidsModule";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
	const { query: { wikiId, pyramidId, date } } = req;

	const userPyramidModule = moduleManager.getModuleById<UserPyramidsModule>("userPyramids");
	if (!userPyramidModule) {
		res.status(500).json({ errorMessage: "Internal server error" });
		return;
	}

	if (!wikiId || isArray(wikiId)) {
		res.status(400).json({ errorMessage: "Invalid or missing wikiId parameter" });
		return;
	}

	if (!pyramidId || isArray(pyramidId)) {
		res.status(400).json({ errorMessage: "Invalid or missing pyramidId parameter" });
		return;
	}

	if (!date || isArray(date)) {
		res.status(400).json({ errorMessage: "Invalid or missing date parameter" });
		return;
	}

	const wikiPyramids = userPyramidModule.userPyramids.find(x => x.wiki === wikiId);

	if (userPyramidModule.availableAt.indexOf(wikiId) === -1
		|| !wikiPyramids
		|| wikiPyramids.valid === false) {
		res.status(400).json({ errorMessage: "This wiki is not supported or not configured properly" });
		return;
	}

	const pyramidDefinition = wikiPyramids.userPyramids.find(x => x.id === pyramidId);
	if (!pyramidDefinition) {
		res.status(400).json({ errorMessage: "Invalid wiki pyramid id" });
		return;
	}

	// TODO: return series data
	res.status(200).json(pyramidDefinition);
}
