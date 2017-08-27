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