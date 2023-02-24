# Basalt eBook Reader Development Roadmap

Short-term (before release):

- Add style editor.
    - Allow users to edit reader styles, both on a global basis and on a per-book basis, and including the option to override book styles or not for each style the users define.
    - Also allow library style to be edited separately from book style.
- Final release preparations
    - Add "about" link and any other relevant links to footer
    - Fill in manifest.
    - Tighten sandboxing.
    - Write docs and update readme.

Medium-term (next steps after release):

- Navigation V2
    - Replace current awkward table-of-contents view with a mapping from spine to TOC, with each entry in each as a clickable link.
        - For each spine item, allow overriding default render settings, e.g. writing mode
    - Add a Fimfiction-style top bar allowing settings and navigation access from the middle of the page without requiring scrolling.
    - Add history-tracking and support for back/forward buttons, either soft or (ideally) hard.
    - Add support for a reload button, likely soft since a hard one would produce problems for people who *actually do* want to reload the extension tab.
    - Support non-TOC navs (page list et al.).
- Library V2
    - Track and display recently-read books and positions therein. Return to last-read position upon reopening.
    - Cache recently-opened books (up to user-definable number and/or total size), to allow reopening without the file-picker dialogue
- Style editor V2
    - Add preview plane to style editor to show the CSS it's currently generating
    - Allow moving style editor between left and right sides of page
- Settings menu
    - Cache options: number / max size of books to cache, and whether to open straight into the last cached book
    - Sync options: whether to sync styles between devices (separate options for global vs. book styles)
- Add support for non-Firefox browsers.
- Support SVGs in the spine.
- Add support for `scrolled-continuous` display, and an option to default to it.

Long-term (stretch goals, nice-to-have but outside of current scope):

- Add support for text-to-speech and Media Overlays.
- Add support for `paginated` display.
- Full EPUB 2 compliance.
- Full EPUB 3 compliance.

Nice-to-haves (may or may not be possible or practical, but belong in the prior lists if they are):

- Allow opening EPUBs straight into the extension-viewer, analogous to how Firefox currently handles PDFs.
    - [Open In Browser](https://github.com/Rob--W/open-in-browser) is an extension that exists and might serve as a source of guidance here, but it seems to work very awkwardly, not in a nice native way like the PDF handler.
- Add multiple layouts in the styles of different webfiction sites and/or readers, in addition to the default one.
- Rename the reader to something more interesting / character-indicating.
- Support more ebook formats (e.g. Kindle formats, CBZ/CBR, PDF, etc.)
- Represent book internals as a virtual FS, with outgoing fetch requests intercepted by a service worker or equivalent, so as to avoid the need for link-rewriting and enable more natural history-display. (See [Bugzilla 1344561](https://bugzilla.mozilla.org/show_bug.cgi?id=1344561).)
