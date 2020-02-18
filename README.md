# search-editor-apply-changes README

Apply changes in a Search Editor to files in a workspace.

Steps:
- Run a search
- Edit results
- Run command "Apply Search Editgor changes to worksapce"

> Warning: Ensure the workspace is in sync with the Search Editor before starting to make changes, otherwise data loss may occur. This can be done by simply rerunning the Editor's search.

Search editor changes will overwrite their target files at the lines specified in the editor - if the lines in the target document have been modified shifted around this will result in erroneous overwriting of existing data.


### What is this repository?

This is an example provided to the community of how such and extension could be implemented. It is not battle-hardened and may contain bugs, as such it is not published to the Marketplace. Others are free to build upon this extension and release it to the Marketplace. Alternatively, you may simple clone it and use [`vsce`](https://www.npmjs.com/package/vsce) to package a local version for yourself.