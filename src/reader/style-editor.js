"use strict";

/////////////////
//   Globals   //
/////////////////

// Type

var editorType = document.getElementById("typemeta").getAttribute("content");

// Relevant HTML elements

var bookSaveChangesButton = document.getElementById("booksavechanges");
var globalSaveChangesButton = document.getElementById("globalsavechanges");

var bookFormElements = bookSaveChangesButton.form.elements;
var globalFormElements = globalSaveChangesButton.form.elements;

var bookSavedState = {
    font: {
        value: bookFormElements.bookfont.value,
        override: bookFormElements.bookfontoverride.checked,
    },
    fontsize: {
        value: bookFormElements.bookfontsize.value,
        override: bookFormElements.bookfontsizeoverride.checked,
    },
    color: {
        value: bookFormElements.bookcolor.value,
        override: bookFormElements.bookcoloroverride.checked,
    },
    linkcolor: {
        value: bookFormElements.booklinkcolor.value,
        override: bookFormElements.booklinkcoloroverride.checked,
    },
    linespacing: {
        value: bookFormElements.booklinespacing.value,
        override: bookFormElements.booklinespacingoverride.checked,
    },
    paragraphspacing: {
        value: bookFormElements.bookparagraphspacing.value,
        override: bookFormElements.bookparagraphspacingoverride.checked,
    },
    indentation: {
        value: bookFormElements.bookindentation.value,
        override: bookFormElements.bookindentationoverride.checked,
    },
    imagesizecap: {
        value: bookFormElements.bookimagesizecap.checked,
        override: bookFormElements.bookimagesizecapoverride.checked,
    },
    bgcolor: {
        value: bookFormElements.bookbgcolor.value,
        override: bookFormElements.bookbgcoloroverride.checked,
    },
    uicolor: {
        value: bookFormElements.bookuicolor.value,
        override: bookFormElements.bookuicoloroverride.checked,
    },
    margins: {
        value: bookFormElements.bookmargins.value,
        override: bookFormElements.bookmarginsoverride.checked,
    },
    lightcss: {
        value: bookFormElements.booklightcss.value,
    },
    heavycss: {
        value: bookFormElements.bookheavycss.value,
    },
    uicss: {
        value: bookFormElements.bookuicss.value,
    },
};

///////////////////
//   Functions   //
///////////////////

function getGlobalStyleInfo() {
    return {
        font: {
            value: globalFormElements.globalfont.value,
            override: globalFormElements.globalfontoverride.checked,
        },
        fontSize: {
            value: globalFormElements.globalfontsize.value,
            override: globalFormElements.globalfontsizeoverride.checked,
        },
        textColor: {
            value: globalFormElements.globalcolor.value,
            override: globalFormElements.globalcoloroverride.checked,
        },
        linkColor: {
            value: globalFormElements.globallinkcolor.value,
            override: globalFormElements.globallinkcoloroverride.checked,
        },
        lineSpacing: {
            value: globalFormElements.globallinespacing.value,
            override: globalFormElements.globallinespacingoverride.checked,
        },
        paragraphSpacing: {
            value: globalFormElements.globalparagraphspacing.value,
            override: globalFormElements.globalparagraphspacingoverride.checked,
        },
        indentation: {
            value: globalFormElements.globalindentation.value,
            override: globalFormElements.globalindentationoverride.checked,
        },
        imageSizeCap: {
            value: globalFormElements.globalimagesizecap.checked,
            override: globalFormElements.globalimagesizecapoverride.checked,
        },
        backgroundColor: {
            value: globalFormElements.globalbgcolor.value,
            override: globalFormElements.globalbgcoloroverride.checked,
        },
        uiColor: {
            value: globalFormElements.globaluicolor.value,
            override: globalFormElements.globaluicoloroverride.checked,
        },
        margins: {
            value: globalFormElements.globalmargins.value,
            override: globalFormElements.globalmarginsoverride.checked,
        },
        customCssNoOverride: {
            value: globalFormElements.globallightcss.value,
        },
        customCssOverrideBook: {
            value: globalFormElements.globalheavycss.value,
        },
        customCssOverrideUi: {
            value: globalFormElements.globaluicss.value,
        },
    }
}

function getBookStyleInfo() {
    return {
        font: {
            value: bookFormElements.bookfont.value,
            override: bookFormElements.bookfontoverride.checked,
            useGlobal: bookFormElements.bookfontglobal.checked,
        },
        fontSize: {
            value: bookFormElements.bookfontsize.value,
            override: bookFormElements.bookfontsizeoverride.checked,
            useGlobal: bookFormElements.bookfontsizeglobal.checked,
        },
        textColor: {
            value: bookFormElements.bookcolor.value,
            override: bookFormElements.bookcoloroverride.checked,
            useGlobal: bookFormElements.bookcolorglobal.checked,
        },
        linkColor: {
            value: bookFormElements.booklinkcolor.value,
            override: bookFormElements.booklinkcoloroverride.checked,
            useGlobal: bookFormElements.booklinkcolorglobal.checked,
        },
        lineSpacing: {
            value: bookFormElements.booklinespacing.value,
            override: bookFormElements.booklinespacingoverride.checked,
            useGlobal: bookFormElements.booklinespacingglobal.checked,
        },
        paragraphSpacing: {
            value: bookFormElements.bookparagraphspacing.value,
            override: bookFormElements.bookparagraphspacingoverride.checked,
            useGlobal: bookFormElements.bookparagraphspacingglobal.checked,
        },
        indentation: {
            value: bookFormElements.bookindentation.value,
            override: bookFormElements.bookindentationoverride.checked,
            useGlobal: bookFormElements.bookindentationglobal.checked,
        },
        imageSizeCap: {
            value: bookFormElements.bookimagesizecap.checked,
            override: bookFormElements.bookimagesizecapoverride.checked,
            useGlobal: bookFormElements.bookimagesizecapglobal.checked,
        },
        backgroundColor: {
            value: bookFormElements.bookbgcolor.value,
            override: bookFormElements.bookbgcoloroverride.checked,
            useGlobal: bookFormElements.bookbgcolorglobal.checked,
        },
        uiColor: {
            value: bookFormElements.bookuicolor.value,
            override: bookFormElements.bookuicoloroverride.checked,
            useGlobal: bookFormElements.bookuicolorglobal.checked,
        },
        margins: {
            value: bookFormElements.bookmargins.value,
            override: bookFormElements.bookmarginsoverride.checked,
            useGlobal: bookFormElements.bookmarginsglobal.checked,
        },
        customCssNoOverride: {
            value: bookFormElements.booklightcss.value,
            useGlobal: bookFormElements.booklightcssglobal.checked,
        },
        customCssOverrideBook: {
            value: bookFormElements.bookheavycss.value,
            useGlobal: bookFormElements.bookheavycssglobal.checked,
        },
        customCssOverrideUi: {
            value: bookFormElements.bookuicss.value,
            useGlobal: bookFormElements.bookuicssglobal.checked,
        },
    };
}

// globalCheckbox: checkbox input; if checked, switch to global style, else switch to nonglobal style
// styleKey: string, key into bookSavedState
function updateStyleAndOverrideOnGlobalToggle(globalCheckbox, styleKey) {
    let bookStyleKey = `book${styleKey}`;
    let bookOverrideKey = `book${styleKey}override`;

    if (globalCheckbox.checked) {
        bookSavedState[styleKey].value = bookFormElements[bookStyleKey].value;
        bookFormElements[bookStyleKey].value = globalFormElements[`global${styleKey}`].value;
        bookFormElements[bookStyleKey].disabled = true;

        bookSavedState[styleKey].override = bookFormElements[bookOverrideKey].checked;
        bookFormElements[bookOverrideKey].checked = globalFormElements[`global${styleKey}override`].checked;
        bookFormElements[bookOverrideKey].disabled = true;
    } else {
        bookFormElements[bookStyleKey].value = bookSavedState[styleKey].value;
        bookFormElements[bookStyleKey].disabled = false;

        bookFormElements[bookOverrideKey].checked = bookSavedState[styleKey].override;
        bookFormElements[bookOverrideKey].disabled = false;
    }
}

// globalCheckbox: checkbox input; if checked, switch to global style, else switch to nonglobal style
// styleKey: string, key into bookSavedState
function updateStyleAloneOnGlobalToggle(globalCheckbox, styleKey) {
    let bookStyleKey = `book${styleKey}`;

    if (globalCheckbox.checked) {
        bookSavedState[styleKey].value = bookFormElements[bookStyleKey].value;
        bookFormElements[bookStyleKey].value = globalFormElements[`global${styleKey}`].value;
        bookFormElements[bookStyleKey].disabled = true;
    } else {
        bookFormElements[bookStyleKey].value = bookSavedState[styleKey].value;
        bookFormElements[bookStyleKey].disabled = false;
    }
}

/////////////////////////
//   Event listeners   //
/////////////////////////

bookFormElements.bookfontglobal.addEventListener("change", _ => updateStyleAndOverrideOnGlobalToggle(bookFormElements.bookfontglobal, "font"));

bookFormElements.bookfontsizeglobal.addEventListener("change", _ => updateStyleAndOverrideOnGlobalToggle(bookFormElements.bookfontsizeglobal, "fontsize"));

bookFormElements.bookcolorglobal.addEventListener("change", _ => updateStyleAndOverrideOnGlobalToggle(bookFormElements.bookcolorglobal, "color"));

bookFormElements.booklinkcolorglobal.addEventListener("change", _ => updateStyleAndOverrideOnGlobalToggle(bookFormElements.booklinkcolorglobal, "linkcolor"));

bookFormElements.booklinespacingglobal.addEventListener("change", _ => updateStyleAndOverrideOnGlobalToggle(bookFormElements.booklinespacingglobal, "linespacing"));

bookFormElements.bookparagraphspacingglobal.addEventListener("change", _ => updateStyleAndOverrideOnGlobalToggle(bookFormElements.bookparagraphspacingglobal, "paragraphspacing"));

bookFormElements.bookindentationglobal.addEventListener("change", _ => updateStyleAndOverrideOnGlobalToggle(bookFormElements.bookindentationglobal, "indentation"));

bookFormElements.bookimagesizecapglobal.addEventListener("change", _ => updateStyleAndOverrideOnGlobalToggle(bookFormElements.bookimagesizecapglobal, "imagesizecap"));

bookFormElements.bookbgcolorglobal.addEventListener("change", _ => updateStyleAndOverrideOnGlobalToggle(bookFormElements.bookbgcolorglobal, "bgcolor"));

bookFormElements.bookuicolorglobal.addEventListener("change", _ => updateStyleAndOverrideOnGlobalToggle(bookFormElements.bookuicolorglobal, "uicolor"));

bookFormElements.bookmarginsglobal.addEventListener("change", _ => updateStyleAndOverrideOnGlobalToggle(bookFormElements.bookmarginsglobal, "margins"));

bookFormElements.booklightcssglobal.addEventListener("change", _ => updateStyleAloneOnGlobalToggle(bookFormElements.booklightcssglobal, "lightcss"));

bookFormElements.bookheavycssglobal.addEventListener("change", _ => updateStyleAloneOnGlobalToggle(bookFormElements.bookheavycssglobal, "heavycss"));

bookFormElements.bookuicssglobal.addEventListener("change", _ => updateStyleAloneOnGlobalToggle(bookFormElements.bookuicssglobal, "uicss"));

globalSaveChangesButton.addEventListener("click", _ => parent.parent.postMessage({messageType: "BasaltUpdateStyle", newStyle: getGlobalStyleInfo(), newStyleType: "global", editorType: editorType}, parent.parent.document.documentURI));

bookSaveChangesButton.addEventListener("click", _ => {
    parent.parent.postMessage({messageType: "BasaltUpdateStyle", newStyle: getBookStyleInfo(), newStyleType: "book", editorType: editorType}, parent.parent.document.documentURI);
    bookSavedState = {
        font: {
            value: bookFormElements.bookfont.value,
            override: bookFormElements.bookfontoverride.checked,
        },
        fontsize: {
            value: bookFormElements.bookfontsize.value,
            override: bookFormElements.bookfontsizeoverride.checked,
        },
        textcolor: {
            value: bookFormElements.bookcolor.value,
            override: bookFormElements.bookcoloroverride.checked,
        },
        linkcolor: {
            value: bookFormElements.booklinkcolor.value,
            override: bookFormElements.booklinkcoloroverride.checked,
        },
        linespacing: {
            value: bookFormElements.booklinespacing.value,
            override: bookFormElements.booklinespacingoverride.checked,
        },
        paragraphspacing: {
            value: bookFormElements.bookparagraphspacing.value,
            override: bookFormElements.bookparagraphspacingoverride.checked,
        },
        indentation: {
            value: bookFormElements.bookindentation.value,
            override: bookFormElements.bookindentationoverride.checked,
        },
        imagesizecap: {
            value: bookFormElements.bookimagesizecap.checked,
            override: bookFormElements.bookimagesizecapoverride.checked,
        },
        backgroundcolor: {
            value: bookFormElements.bookbgcolor.value,
            override: bookFormElements.bookbgcoloroverride.checked,
        },
        uicolor: {
            value: bookFormElements.bookuicolor.value,
            override: bookFormElements.bookuicoloroverride.checked,
        },
        margins: {
            value: bookFormElements.bookmargins.value,
            override: bookFormElements.bookmarginsoverride.checked,
        },
        lightcss: {
            value: bookFormElements.booklightcss.value,
        },
        heavycss: {
            value: bookFormElements.bookheavycss.value,
        },
        uicss: {
            value: bookFormElements.bookuicss.value,
        },
    };
});
