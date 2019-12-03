const quantifierRule = prefix => $ => seq(
	prefix($),
	optional(alias('?', $.lazy)),
)

const groupRule = identifier => $ => seq(
	$.group_begin,
	identifier($),
	optional($.pattern),
	$.group_end,
)

const SYNTAX_CHARS = [
	...'^$\\.*+?()[]{}|'
]

const SYNTAX_CHARS_ESCAPED = SYNTAX_CHARS.map(
	char => `\\${char}`
).join('')

module.exports = grammar({
	name: 'regex',
	
	externals: $ => [
		$.null_character,	// \0  (not followed by 0-9)
	],
	
	extras: $ => [],
	
	conflicts: $ => [
		[ $.unicode_escape, $._escape_operator ],
		[ $.hexadecimal_escape, $._escape_operator ],
		[ $.control_letter_escape, $._escape_operator ],
	],
	
	inline: $ => [
		$.pattern,
		$.unit,
		$.quantifier,
		$._invalid_quantifier,
		$._invalid_secondary_quantifier,
		$.set_unit,
		$.set_atom,
		$.character_escape,
		$.unicode_property_expression,
		$._invalid_character_class_escape,
		$._invalid_character_escape,
		$._invalid_unicode_escape,
		$._invalid_hexadecimal_escape,
		//$._invalid_control_letter_escape,
	],
	
	rules: {
		regex: $ => $.pattern,
		
		pattern: $ => seq(
			repeat1(seq(
				$.unit,
				optional(choice(
					seq(
						$.quantifier,
						optional($._invalid_secondary_quantifier),
					),
					$._invalid_quantifier,
				)),
			)),
			optional($.disjunction),
		),
		
		disjunction: $ => seq(
			$.disjunction_delimiter,
			optional($.pattern),
		),
		disjunction_delimiter: $ => '|',
		
		unit: $ => choice(
			$.non_syntax_character,						// NOT: ^ $ \ . * + ? ( ) [ ] { } | / or newline
			$.any_character,							// .
			$.start_assertion,							// ^
			$.end_assertion,							// $
			$.boundary_assertion,						// \b
			$.non_boundary_assertion,					// \B
			$.character_escape,							// \f \n \r \t \v \c__ \x__ \u__ \u{__} \0 \^ \$ \\ \. \* \+ \? \( \) \[ \] \{ \} \| \/
			$._invalid_character_escape,
			$.character_class_escape,					// \d \D \s \S \w \W \p{__} \P{__} \p{__=__} \P{__=__}
			$._invalid_character_class_escape,
			$.backreference,							// \1 ... \9 \1__ ... \9__ \k<__>
			alias($.character_set, $.character_class),	// [__] [^__]
			$.anonymous_capturing_group,				// (__)
			$.non_capturing_group,						// (?:__)
			$.named_capturing_group,					// (?<__>__)
			$.lookahead_assertion,						// (?=__)
			$.negative_lookahead_assertion,				// (?!__)
			$.lookbehind_assertion,						// (?<=__)
			$.negative_lookbehind_assertion,			// (?<!__)
		),
		
		
		//#####  quantifiers  #####
		
		
		quantifier: $ => choice(
			$.zero_or_more,		// * *?
			$.one_or_more,		// + +?
			$.optional,			// ? ??
			$.count_quantifier,	// {__} {__,} {__,__} {__}? {__,}? {__,__}?
		),
		_invalid_quantifier: $ => choice(
			/\{,/,
			/\{[0-9]*[^0-9,}]/,
			/\{[0-9]+,[0-9]*[^0-9}]/,
		),
		_invalid_secondary_quantifier: $ => choice(
			/[?*+]/,
			/\{[0-9]+(,[0-9]*)?\}/,
		),
		
		
		zero_or_more: quantifierRule($ => '*'),
		one_or_more: quantifierRule($ => '+'),
		optional: quantifierRule($ => '?'),
		count_quantifier: quantifierRule($ => seq(
			'{',
			seq(
				alias(/[0-9]+/, $.count_quantifier_value),
				optional(seq(
					alias(',', $.count_quantifier_delimiter),
					optional(alias(/[0-9]+/, $.count_quantifier_value)),
				)),
			),
			'}',
		)),
		
		
		//#####  lookaround assertions  #####
		
		
		lookahead_assertion: groupRule($ => alias('?=', $.lookahead_identifier)),
		negative_lookahead_assertion: groupRule($ => alias('?!', $.negative_lookahead_identifier)),
		lookbehind_assertion: groupRule($ => alias('?<=', $.lookbehind_identifier)),
		negative_lookbehind_assertion: groupRule($ => alias('?<!', $.negative_lookbehind_identifier)),
		
		
		//#####  backreferences  #####
		
		
		backreference: $ => choice(
			seq('\\', /[1-9][0-9]*/),
			seq('\\k<', $.group_name, '>'),
		),
		
		
		//#####  groups  #####
		
		
		named_capturing_group: groupRule($ => $.named_capturing_group_identifier),
		named_capturing_group_identifier: $ => seq(
			'?<',
			$.group_name,
			'>',
		),
		
		// TODO: This seems to match what Chrome allows for group names, but make this match the spec.
		// https://tc39.es/proposal-regexp-named-groups/
		// http://www.unicode.org/reports/tr31/#Table_Lexical_Classes_for_Identifiers
		group_name: $ => seq(
			choice(
				/[a-zA-Z0-9_$]/,
				$.unicode_escape,
			),
			repeat(
				choice(
					/[a-zA-Z0-9_$\u200C\u200D]/,
					$.unicode_escape,
				),
			),
		),
		
		non_capturing_group: groupRule($ => alias('?:', $.non_capturing_group_identifier)),
		
		anonymous_capturing_group: groupRule($ => blank()),
		
		group_begin: $ => '(',
		group_end: $ => ')',
		
		
		//#####  character sets  #####
		
		
		character_set: $ => seq(
			alias('[', $.set_begin),
			optional(alias('^', $.set_negation)),
			repeat(
				prec.right(choice(
					alias($.set_range, $.character_range),
					seq(
						$.set_unit,
						optional(alias('-', $.non_syntax_character)),	//otherwise, a hyphen at the end of the character set would be an error (e.g., `[a-]`) - TODO: why is it an error???
					),
				)),
			),
			alias(']', $.set_end),
		),
		
		set_range: $ => seq(
			$.set_atom,
			alias('-', $.range_delimiter),
			$.set_atom,
		),
		
		set_unit: $ => choice(
			$.set_atom,
			$.character_class_escape,							// \d \D \s \S \w \W \p{__} \P{__} \p{__=__} \P{__=__}
			$._invalid_character_class_escape,
			$._invalid_character_escape,
		),
		
		set_atom: $ => choice(
			alias(/[^\\\]]/, $.non_syntax_character),			// NOT: \ ]
			$.character_escape,									// \f \n \r \t \v \c__ \x__ \u__ \u{__} \0 \^ \$ \\ \. \* \+ \? \( \) \[ \] \{ \} \| \/
			alias('\\b', $.special_escape),						// \b
			alias($.set_identity_escape, $.identity_escape),		// \-
		),
		
		set_identity_escape: $ => seq(
			alias($._escape_operator, $.escape_operator),
			'-',
		),
			
		
		//#####  character class escapes  #####
		
		
		character_class_escape: $ => choice(
			/\\[dDsSwW]/,
			seq(
				/\\[pP]\{/,
				$.unicode_property_expression,
				'}',
			),
		),
		unicode_property_expression: $ => seq(
			optional(seq(
				alias($._unicode_property, $.unicode_property_name),
				alias('=', $.unicode_property_operator),
			)),
			alias($._unicode_property, $.unicode_property_value),
		),
		_unicode_property: $ => /[a-zA-Z_0-9]+/,
		_invalid_character_class_escape: $ => seq(
			/\\[pP]\{/,
			seq(
				optional(seq(
					$._unicode_property,
					'='
				)),
				$._unicode_property,
			),
		),
		
		
		//#####  character escapes  #####
		
		
		character_escape: $ => choice(
			prec(1, choice(
				$.special_escape,
				$.control_letter_escape,
				$.hexadecimal_escape,
				$.unicode_escape,
				$.null_character,
			)),
			$.identity_escape,
		),
		_invalid_character_escape: $ => choice(
			$._invalid_unicode_escape,
			$._invalid_hexadecimal_escape,
		),
		
		//escapes that remove any special meaning of a character
		identity_escape: $ => seq(
			alias($._escape_operator, $.escape_operator),
			/[\^$\\.*+?()\[\]{}|\/]/,	// ^ $ \ . * + ? ( ) [ ] { } | /
		),
		
		unicode_escape: $ => seq(
			'\\u',
			choice(
				alias(/[a-fA-F0-9]{4}/, $.unicode_code),
				seq(
					'{',
					alias(/0*(?:[a-fA-F0-9]{1,5}|10[a-fA-F0-9]{4})/, $.unicode_code),
					'}',
				),
			),
		),
		_invalid_unicode_escape: $ => seq(
			'\\u',
			choice(
				/[a-fA-F0-9]{0,3}/,
				seq(
					'{',
					choice(
						/0*(?:[a-fA-F0-9]{1,5}|10[a-fA-F0-9]{4})/,
						/0*[a-fA-F0-9]{0,4}/,
						'}',
					),
				),
			),
		),
		
		hexadecimal_escape: $ => seq(
			'\\x',
			alias(/[a-fA-F0-9]{2}/, $.hexadecimal_code),
		),
		_invalid_hexadecimal_escape: $ => seq(
			'\\x',
			///[a-fA-F0-9]{0,1}/	<--- this causes a very bad memory leak in Atom; TODO: submit bug report
			///[a-fA-F0-9]?/	<--- this causes a very bad memory leak in Atom; TODO: submit bug report
			optional(/[a-fA-F0-9]/),
		),
		//_invalid_hexadecimal_escape: $ => /\\x[a-fA-F0-9]?/,	<--- this causes a memory leak when running `tree-sitter generate`; TODO: submit bug report
		
		control_letter_escape: $ => seq(
			'\\c',
			alias(/[a-zA-Z]/, $.control_letter_code),
		),
		/*_invalid_control_letter_escape: $ => seq(
			'\\c',
		),*/
		
		special_escape: $ => /\\[fnrtv]/,
		
		_escape_operator: $ => '\\',
		
		
		//#####  boundary assertions  #####
		
		
		start_assertion: $ => '^',
		end_assertion: $ => '$',
		boundary_assertion: $ => '\\b',
		non_boundary_assertion: $ => '\\B',
		
		
		//#####  characters  #####
		
		
		any_character: $ => '.',
		
		//string of non-syntax characters
		non_syntax_character: $ => /[^\^$\\.*+?()\[\]{}|\/\n]/,	// NOT: ^ $ \ . * + ? ( ) [ ] { } | / or newline
	}
})
