"use strict";

/////////////////
//   Globals   //
/////////////////

// Relevant HTML elements

var bookSaveChangesButton = document.getElementById("booksavechanges");
var globalSaveChangesButton = document.getElementById("globalsavechanges");

var bookFormElements = bookSaveChangesButton.form.elements;
var globalFormElements = globalSaveChangesButton.form.elements;

// Saved state for global style toggle

var bookFontSavedState = bookFormElements.bookfont.value;
var bookFontOverrideSavedState = bookFormElements.bookfontoverride.checked;
var bookCustomCssNoOverrideSavedState = bookFormElements.booklightcss.value;

///////////////////
//   Functions   //
///////////////////

// Both of these are just for testing; it might be the case that no functions are needed, in the long run?

function getBookStyleInfo() {
    return {
        font: {
            value: bookFormElements.bookfont.value,
            override: bookFormElements.bookfontoverride.checked,
            useGlobal: bookFormElements.bookfontglobal.checked,
        },
        customCssNoOverride: {
            value: bookFormElements.booklightcss.value,
            useGlobal: bookFormElements.booklightcssglobal.checked,
        },
    };
}

function getGlobalStyleInfo() {
    return {
        font: {
            value: null,
            override: globalFormElements.globalfontoverride.checked,
        },
        customCssNoOverride: {
            value: null,
        },
    }
}

/////////////////////////
//   Event listeners   //
/////////////////////////

bookFormElements.bookfontglobal.addEventListener("change", _ => {
    if (bookFormElements.bookfontglobal.checked) {
        bookFontSavedState = bookFormElements.bookfont.value;
        bookFormElements.bookfont.value = globalFormElements.globalfont.value;
        bookFormElements.bookfont.disabled = true;
        bookFontOverrideSavedState = bookFormElements.bookfontoverride.checked;
        bookFormElements.bookfontoverride.checked = globalFormElements.globalfontoverride.checked;
        bookFormElements.bookfontoverride.disabled = true;
    } else {
        bookFormElements.bookfont.value = bookFontSavedState;
        bookFormElements.bookfont.disabled = false;
        bookFormElements.bookfontoverride.checked = bookFontOverrideSavedState;
        bookFormElements.bookfontoverride.disabled = false;
    }
});

bookFormElements.booklightcssglobal.addEventListener("change", _ => {
    if (bookFormElements.booklightcssglobal.checked) {
        bookCustomCssNoOverrideSavedState = bookFormElements.booklightcss.value;
        bookFormElements.booklightcss.value = globalFormElements.globallightcss.value;
        bookFormElements.booklightcss.disabled = true;
    } else {
        bookFormElements.booklightcss.value = bookCustomCssNoOverrideSavedState;
        bookFormElements.booklightcss.disabled = false;
    }
});

bookSaveChangesButton.addEventListener("click", _ => console.info(getBookStyleInfo()));
globalSaveChangesButton.addEventListener("click", _ => console.info(getGlobalStyleInfo()));

// Next: style-changes on save, plus saving-to-storage.
// Then, at that point, it'll be time to fill in all the placeholders.
