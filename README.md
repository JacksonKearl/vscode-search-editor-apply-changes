# Search Editor: Apply Changes

In the marketplace [here](https://marketplace.visualstudio.com/items?itemName=jakearl.search-editor-apply-changes).

Apply changes in a Search Editor to files in a workspace.

![Example usage](https://raw.githubusercontent.com/JacksonKearl/vscode-search-editor-apply-changes/master/demo.gif)

Steps:
- Run a search
- Edit results
- Run command "Apply Search Editor changes to worksapce"

> Warning: Ensure the workspace is in sync with the Search Editor before starting to make changes, otherwise data loss may occur. This can be done by simply rerunning the Editor's search.

Search editor changes will overwrite their target files at the lines specified in the editor - if the lines in the target document have been modified shifted around this will result in erroneous overwriting of existing data.

This is a very early expermient of what writing local search editor changes out to the workspace might look like, please file bugs and feature requests as you see fit!

## Known Limitations
- No way to apply edits that insert or delete lines.

## Keybindings
You may find the following keybinding helpful for making the default "save" behaviour write out to workspace rather than save a copy of the results:

```json
  {
    "key": "cmd+s",
    "command": "searchEditorApplyChanges.apply",
    "when": "inSearchEditor"
  }
```