import { isArray } from "lodash";
import { NextApiRequest, NextApiResponse } from "next";
import { moduleManager } from "../../../server/modules/moduleManager";
import { UserPyramidsModule } from "../../../server/modules/userPyramidsModule/userPyramidsModule";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
	const { query: { wikiId } } = req;

	const userPyramidModule = moduleManager.getModuleById<UserPyramidsModule>("userPyramids");
	if (!userPyramidModule) {
		res.status(500).json({ errorMessage: "Internal server error" });
		return;
	}

	if (!wikiId || isArray(wikiId)) {
		res.status(400).json({ errorMessage: "Invalid or missing wikiId parameter" });
		return;
	}

	const wikiPyramids = userPyramidModule.userPyramids.find(x => x.wiki === wikiId);

	if (userPyramidModule.availableAt.indexOf(wikiId) === -1
		|| !wikiPyramids
		|| wikiPyramids.valid === false) {
		res.status(400).json({ errorMessage: "This wiki is not supported or not configured properly" });
		return;
	}

	res.status(200).json(wikiPyramids.userPyramids.map(pyramid => ({
		id: pyramid.id,
		name: pyramid.name
	})));
}
