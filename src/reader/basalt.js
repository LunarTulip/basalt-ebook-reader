"use strict";

var book;
var toc;
var rendition;

function set_toc_dropdowns(toc) {
    let toc_dropdowns = Array.from(document.getElementsByClassName("tocDropdown"));
    toc.forEach(toc_entry => {
        let entry_element = document.createElement("option");
        entry_element.setAttribute("value", toc_entry.id);
        entry_element.textContent = toc_entry.label;
        toc_dropdowns.forEach(dropdown => dropdown.appendChild(entry_element.cloneNode(true)));
    });
}

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
