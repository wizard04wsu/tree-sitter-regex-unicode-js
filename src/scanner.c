#include <tree_sitter/parser.h>
#include <string.h>

enum TokenType {
	NULL_CHAR
};

void * tree_sitter_regex_external_scanner_create() { return NULL; }
void tree_sitter_regex_external_scanner_destroy(void *payload) {}
unsigned tree_sitter_regex_external_scanner_serialize(void *payload, char *buffer) { return 0; }
void tree_sitter_regex_external_scanner_deserialize(void *payload, const char *buffer, unsigned length) {}

static void advance(TSLexer *lexer) {
	lexer->advance(lexer, false);
}

bool tree_sitter_regex_external_scanner_scan(
	void *payload,
	TSLexer *lexer,
	const bool *valid_symbols
) {
	if (valid_symbols[NULL_CHAR] && lexer->lookahead == '\\') {
		advance(lexer);
		if (lexer->lookahead != '0') {
			return false;
		}
		advance(lexer);
		char nextCharCode = (int)(lexer->lookahead);
		if (nextCharCode>=48 && nextCharCode<=57) {	//0-9
			return false;
		}
		lexer->result_symbol = NULL_CHAR;
		return true;
	}
	
	return false;
}
