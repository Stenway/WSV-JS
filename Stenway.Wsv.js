/* (C) Stefan John / Stenway / WhitespaceSV.com / 2021 */

"use strict";

const CODEPOINT_LINEFEED = 0x0A;
const CODEPOINT_DOUBLEQUOTE = 0x22;
const CODEPOINT_HASH = 0x23;
const CODEPOINT_SLASH = 0x2F;

class WsvParserError extends Error {
	constructor(lineIndex, linePosition, message) {
		super(`${message} (${lineIndex+1}, ${linePosition+1})`);
		this.name = "WsvParserError";
		this.lineIndex = lineIndex;
		this.linePosition = linePosition;
	}
}

class BasicWsvCharIterator {
	constructor(str, lineIndex) {
		this.chars = WsvChar.getCodePoints(str);
		this.index = 0;
		this.lineIndex = lineIndex;
	}
	
	isEnd() {
		return this.index >= this.chars.length;
	}
	
	is(c) {
		return this.chars[this.index] == c;
	}
	
	isWhitespace() {
		return WsvChar.isWhitespace(this.chars[this.index]);
	}
	
	next() {
		this.index++;
		return !this.isEnd();
	}
	
	get() {
		return this.chars[this.index];
	}
	
	getSlice(startIndex) {
		return this.chars.slice(startIndex, this.index);
	}
	
	getException(message) {
		return new WsvParserError(this.lineIndex, this.index, message);
	}
}

class WsvChar {
	static isWhitespace(c) {
		return c == 0x09 ||
			(c >= 0x0B && c <= 0x0D) ||
			c == 0x20 ||
			c == 0x85 ||
			c == 0xA0 ||
			c == 0x1680 ||
			(c >= 0x2000 && c <= 0x200A) ||
			(c >= 0x2028 && c <= 0x2029) ||
			c == 0x202F ||
			c == 0x205F ||
			c == 0x3000;
	}
	
	static getCodePoints(str) {
		return Array.from(str).map(c => c.codePointAt(0));
	}
}

class WsvLine {
	static parseAsArray(content) {
		return WsvParser.parseLineAsArray(content);
	}
}

class WsvDocument {
	static parseAsJaggedArray(content) {
		return WsvParser.parseDocumentNonPreserving(content);
	}
}

class WsvParser {
	static parseDocumentNonPreserving(content) {
		var lines = content.split('\n');
		var result = [];
		for (var i=0; i<lines.length; i++) {
			var lineStr = lines[i];
			var lineValues = this.__parseLine(lineStr, i);
			result.push(lineValues);
		}
		return result;
	}
	
	static parseLineAsArray(content) {
		return this.parseDocumentNonPreserving(content)[0];
	}
	
	static __parseLine(lineStrWithoutLinefeed, lineIndex) {
		var iterator = new BasicWsvCharIterator(lineStrWithoutLinefeed, lineIndex);
		var values = [];

		while(true) {
			this.__skipWhitespace(iterator);
			if (iterator.isEnd()) {
				break;
			}
			if (iterator.is(CODEPOINT_HASH)) {
				break;
			}
			var curValue;
			if (iterator.is(CODEPOINT_DOUBLEQUOTE)) {
				curValue = this.__parseDoubleQuoteValue(iterator);
			} else {
				curValue = this.__parseValue(iterator);
				if (curValue == "-") {
					curValue = null;
				}
			}
			values.push(curValue);
		}
		
		return values;
	}
	
	static __parseValue(iterator) {
		var startIndex = iterator.index;
		while(true) {
			if (!iterator.next()) {
				break;
			}
			if (iterator.isWhitespace() || iterator.is(CODEPOINT_HASH)) {
				break;
			} else if (iterator.is(CODEPOINT_DOUBLEQUOTE) ) {
				throw iterator.getException("Invalid double quote in value");
			}
		}
		return String.fromCodePoint(...iterator.getSlice(startIndex));
	}
	
	static __parseDoubleQuoteValue(iterator) {
		var value = "";
		while(true) {
			if (!iterator.next()) {
				throw iterator.getException("String not closed");
			}
			if (iterator.is(CODEPOINT_DOUBLEQUOTE)) { 
				if (!iterator.next()) {
					break;
				}
				if (iterator.is(CODEPOINT_DOUBLEQUOTE)) { 
					value += '"';
				} else if (iterator.is(CODEPOINT_SLASH)) { 
					if (!(iterator.next() && iterator.is(CODEPOINT_DOUBLEQUOTE))) {
						throw iterator.getException("Invalid string line break");
					}
					value += '\n';
				} else if (iterator.isWhitespace() || iterator.is(CODEPOINT_HASH)) {
					break;
				} else {
					throw iterator.getException("Invalid character after string");
				}
			} else {
				value += String.fromCodePoint(iterator.get());
			}
		}
		return value;
	}
	
	static __skipWhitespace(iterator) {
		if (iterator.isEnd()) {
			return;
		}
		do {
			if (!iterator.isWhitespace()) {
				break;
			}
		} while(iterator.next());
	}
}

class WsvSerializer {
	static needsDoubleQuotes(value) {
		if (value == null) {
			return false;
		} else if (value.length == 0 || value == "-") {
			return true;
		}
		
		var chars = WsvChar.getCodePoints(value);
		return this.__containsSpecialChar(chars);
	}
	
	static __containsSpecialChar(chars) {
		for (var c of chars) {
			if (WsvChar.isWhitespace(c) || c == CODEPOINT_DOUBLEQUOTE || c == CODEPOINT_HASH) {
				return true;
			}
		}
		return false;
	}
	
	static serializeValue(value) {
		if (value == null) {
			return "-"
		} else if (value.length == 0) {
			return '""';
		} else if (value == "-") {
			return '"-"';
		} else {
			var chars = WsvChar.getCodePoints(value);
			if (this.__containsSpecialChar(chars)) {
				var result = '"';
				for (var c of chars) {
					if (c == CODEPOINT_LINEFEED) {
						result += '"/"';
					} else if (c == CODEPOINT_DOUBLEQUOTE) {
						result += '""';
					} else {
						result += String.fromCodePoint(c);
					}
				}
				result += '"';
				return result;
			} else {
				return value;
			}
		}
	}
	
	static serializeValues(values) {
		var isFirstValue = true;
		var result = "";
		for (var value of values) {
			if (!isFirstValue) {
				result += ' ';
			} else {
				isFirstValue = false;
			}
			result += this.serializeValue(value);
		}
		return result;
	}

	static serialize(lines) {
		var isFirstLine = true;
		var result = "";
		for (var line of lines) {
			if (!isFirstLine) {
				result += '\n';
			} else {
				isFirstLine = false;
			}
			result += this.serializeValues(line);
		}
		return result;
	}
}