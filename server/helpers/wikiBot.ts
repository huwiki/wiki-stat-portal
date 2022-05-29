import { mwn } from "mwn";
import { Logger } from "winston";
import { KnownWiki } from "../interfaces/knownWiki";

export class WikiBot {
	private bot: mwn;

	constructor(
		private readonly wiki: KnownWiki,
		private readonly logger: Logger,
	) {
	}

	public async login(): Promise<boolean> {
		if (!this.wiki.botUserName || !this.wiki.botPassword)
			return false;

		this.bot = await mwn.init({
			apiUrl: `https://${this.wiki.domain}/w/api.php`,

			// Can be skipped if the bot doesn't need to sign in
			username: this.wiki.botUserName,
			password: this.wiki.botPassword,

			userAgent: "WikiStatPortal/1.1 (https://wiki-stat-portal.toolforge.org)",

			// Set default parameters to be sent to be included in every API request
			defaultParams: {
				assert: "user" // ensure we're logged in
			}
		});

		if (this.bot.loggedIn)
			this.logger.info(`[wikiBot::login] Bot successfully logged in to ${this.wiki.id}.`);
		else
			this.logger.warning(`[wikiBot::login] Bot failed to log in to ${this.wiki.id}.`);

		return this.bot.loggedIn;
	}

	public async updatePage(
		pageTitle: string,
		content: string,
		summary: string
	): Promise<boolean> {
		if (this.bot.loggedIn === false) {
			this.logger.info(`[wikiBot::updatePage] Bot account not logged in to ${this.wiki.id}.`);
			return false;
		}

		const pageContent = await this.bot.read(pageTitle);
		if (pageContent.missing === true) {
			const createResp = await this.bot.create(
				pageTitle,
				content,
				summary
			);
			this.logger.info(`[wikiBot::updatePage/${this.wiki.id}] Page ${pageTitle} creation result: ${createResp.result}`);

			return createResp.result === "Success";
		} else {
			const editResp = await this.bot.edit(
				pageTitle,
				() => {
					return {
						text: content,
						summary: summary,
					};
				},
				{
					suppressNochangeWarning: true
				}
			);
			this.logger.info(`[wikiBot::updatePage/${this.wiki.id}] Page ${pageTitle} edit result: ${editResp.result}`);

			return editResp.result === "Success";
		}
	}
}