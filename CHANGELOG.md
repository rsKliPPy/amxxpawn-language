## [Version 0.6.0] - 2018-02-22
### Added
- Syntax highlight for "forward" keyword
- Fuzzy search for completions

### Changed
- Doesn't append `'('` and `'()'` on function autocompletions anymore
- Sytax highlight improvements
- `'^'` is now the string escape character

### Fixed
- Symbols starting with `'@'` weren't being parsed
- Included files that are local to the source file weren't being resolved correctly


## [Version 0.5.0] - 2017-08-31
### Added
- Syntax highlight for "native" keyword
- Append `'('` (or `'()'` if function has no arguments) on function autocompletion
- Hover information when hovering over functions, variables and constants
- `amxxpawn.compiler.reformatOutput` - reformats compiler output to clear unimportant information and remove clutter
- Compiler warnings and errors get turned into diagnostics

### Changed
- Syntax highlight now highlights only known tags from AMXX
- Completion search is now case-insensitive (e.g: typing `null` now mathces `NULL_VECTOR`)
- `amxxpawn.language.webApiLinks` and `amxxpawn.compiler.showInfoMessages` settings are now false by default


## [Version 0.4.0] - 2017-08-29
### Added
- Suggestions/completions for variables and constants
- Some diagnostics for variable/constant definitions
- `amxxpawn.compiler.showInfoMessages` setting - whether compile process shows additional information (arguments, exit code...)

### Fixed
- `[]` and `()` pairs now highlighted too (only `{}` pairs were before)
- CWD is now set to amxxpc's directory when running it


## [Version 0.3.1] - 2017-08-27
### Added
- Reparses open documents when configuration changes

### Fixed
- The parser now substitutes variables in `amxxpawn.compiler.includePaths` too


## [Version 0.3.0] - 2017-08-27
### Added
- Substitution variables are now allowed in settings containing paths
- More diagnostics to the **#include** statement parser

### Fixed
- **#include** statements parser now provides links and diagnostics with a correct character range


## [Version 0.2.1] - 2017-08-27
### Added
- Handle **#tryinclude** statements and underline if can't resolve, but don't produce an error
- Report unmatched closing braces

### Fixed
- Properly parse and resolve **#include** statements
- Properly handle multiple multiline comments on the same line
- Properly handle multiple braces on the same line


## [Version 0.2.0] - 2017-08-25
### Added
- Document symbol lookup (`Ctrl+Shift+O`) - Easy way to search and navigate to any symbol in the currently opened document
- Symbol completion - displays suggestions as you type

### Fixed
- Included dependencies are now properly managed, no more data leaks


## [Version 0.1.0] - 2017-08-25
### Added
- 'Compile Plugin Local' command which searches for amxxpc executable in input file's path


## [Version 0.0.5] - 2017-08-25
### Fixed
- Fixed amxxpawn.compiler.outputType === 'path'
- AMXXPC Output panel now gets focus on compilation


## [Version 0.0.4] - 2017-08-25
### Fixed
- Whitespaces between function's tag and identifier would break the parser


## [Version 0.0.3] - 2017-08-25
### Fixed
- Crash when parsing functions with no storage specifiers


## [Version 0.0.1] - 2017-08-25
- Initial release