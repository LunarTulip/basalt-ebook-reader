"use strict";

var book;
var rendition;

// toc_array: array of book TOC objects, either the top-level TOC or a descendant
// parent_count: number
function get_toc_items(toc_array, parent_count) {
    let items = Array();
    toc_array.forEach(toc_entry => {
        let item_label = (String.fromCharCode(160).repeat(parent_count * 4)) + toc_entry.label.trim(); // The trim is to compensate for an epub.js bug at the cost of fidelity to sources whose TOCs *actually* have whitespace
        items.push({label: item_label, link: toc_entry.href});
        items = items.concat(get_toc_items(toc_entry.subitems, parent_count + 1));
    });
    return items;
}

// toc: book table of contents array
function set_toc_dropdowns(toc) {
    let toc_dropdowns = Array.from(document.getElementsByClassName("tocDropdown"));
    let toc_items = get_toc_items(toc, 0);
    toc_items.forEach(item => {
        let entry_element = document.createElement("option");
        entry_element.setAttribute("value", item.link);
        entry_element.textContent = item.label;
        toc_dropdowns.forEach(dropdown => dropdown.appendChild(entry_element.cloneNode(true)));
    });
}

// file: arrayBuffer containing an EPUB file
async function displayBook(file) {
    book = ePub(file);
    await book.opened;
    set_toc_dropdowns(book.navigation.toc);
    rendition = book.renderTo("book", {flow: "scrolled-doc", width: "100%"});
    rendition.display();
}

// Temporary file-selector until I devise a more stable option
document.getElementById("choosefile").addEventListener("change", function() {
        this.files[0].arrayBuffer().then(displayBook)
});
