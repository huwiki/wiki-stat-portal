WikiStatPortal currently has the modules listed in this document.

# UserPyramids
UserPyramids module shows the population count of predefined user groups. Groups are defined using user pyramid configuration files, which reside in `resources/configuration/modules/userPyramids`. You can read more on the structure of these configuration files [here](Configuration.md#userpyramids-module).

Statistics came from a cached database made from the replicated Wikimedia databases.

## Implementation
* Module class is implemented in `server/modules/userPyramidsModule/userPyramidsModule.ts`.
* Next.js page is implemented in `pages/modules/userPyramids.tsx`.
* User pyramid configuration JSON schema is at `resources/schemas/userPyramidsConfigurationSchema.json`.
