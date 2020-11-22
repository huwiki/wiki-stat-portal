User statistics portal for Wikipedia.

# Development

See details in [documentation/Development.md](documentation/Development.md)

## Tech stack

The site uses Next.js for the backend under Node.js 10+.

For the frontend we use React. Our main React component library is BlueprintJS, and we use MobX for state management. CSS is written using SASS (SCSS).

## Development workflow

Install dependecies using the `yarn` command.

For development, use the `yarn run dev` command, which uses the Next.js infrastructure to take care of building, rebuild upon source changes and hot reloading. The development server runs on port 3000, so you can access the site at `http://localhost:3000`.

To build a version for hosting, use the `yarn run build` command. To start a server for the prebuild version use the `yarn run start` command. You can define the port of the running server with the `PORT` environment variable.

# Production Environment

See details in [Documentation/ProductionEnvironment.md](documentation/ProductionEnvironment.md)

This web application is meant to run on the Wikimedia Toolserver.

# Configuration
For details on configuration, see [Documentation/Configuration.md](documentation/Configuration.md)

# Licence

The code is licenced under the MIT licence.
