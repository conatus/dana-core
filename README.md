# dana-core

Tools for processing and accessing different information types

Executables can be downloaded from https://github.com/commonknowledge/dana-core/releases

## Developer quickstart

Nothing unorthodox here. Clone, run yarn to install dependencies and `yarn start` to run everything.

If you use vscode, you can optionally clone and run this repository in a development container. The GUI is accessible over vnc on port 5901 (password: vscode).

## Release workflow

To cut a new release:

- When the version is ready to test, increment the version number in package.json
- [Draft a new release](https://help.github.com/articles/creating-releases/). Set the “Tag version” to the value of version in package.json, and prefix it with v. “Release title” should be the same as the tag version.
- For example, if package.json version is 1.0, your draft’s “Tag version” and “Release title” would be v1.0.
- Push some commits. Every CI build will update the artifacts attached to this draft.
- Once you are done, publish the release. GitHub will tag the latest commit for you.
