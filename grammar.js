const quantifierRule = prefix => $ => seq(
	prefix($),
	optional(alias('?', $.lazy)),
)

const groupRule = identifier => $ => seq(
	$.group_begin,
	identifier($),
	optional(choice(
		$.pattern,
		$.disjunction,
	)),
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
		[ $.group_name ],
		[ $.unicode_escape, $._escape_operator ],
		[ $.hexadecimal_escape, $._escape_operator ],
		[ $.control_letter_escape, $._escape_operator ],
	],
	
	inline: $ => [
		$.pattern,
		$.disjunction,
		$.unit,
		$.quantifier,
		$._invalid__quantifier,
		$._invalid__secondary_quantifier,
		$._invalid__backreference,
		$._invalid__group_name,
		$._invalid__group_name_part,
		$.set_range_atom,
		$.set_atom,
		$._invalid__character_class_escape,
		$._invalid__in_set__character_class_escape,
		$.character_escape,
		$._invalid__character_escape,
		$._invalid__in_set__character_escape,
		$._invalid__identity_escape,
		$._unicode_escape,
		$._invalid__unicode_escape,
		$._invalid__in_set__unicode_escape,
		$._invalid__hexadecimal_escape,
		$._invalid__in_set__hexadecimal_escape,
		$._invalid__control_letter_escape,
		$._invalid__in_set__control_letter_escape,
	],
	
	rules: {
		regex: $ => choice(
			$.pattern,
			$.disjunction,
		),
		
		pattern: $ => repeat1(seq(
			$.unit,
			optional(choice(
				seq(
					$.quantifier,
					optional($._invalid__secondary_quantifier),
				),
				$._invalid__quantifier,
			)),
		)),
		
		disjunction: $ => seq(
			optional($.pattern),
			repeat1(
				seq(
					$.disjunction_delimiter,
					optional($.pattern),
				),
			),
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
			$._invalid__character_escape,
			$.identity_escape,
			$._invalid__identity_escape,
			$.character_class_escape,					// \d \D \s \S \w \W \p{__} \P{__} \p{__=__} \P{__=__}
			$._invalid__character_class_escape,
			$.backreference,							// \1 ... \9 \1__ ... \9__ \k<__>
			$._invalid__backreference,
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
		
		
		quantifier: $ => prec(1, choice(
			$.zero_or_more,		// * *?
			$.one_or_more,		// + +?
			$.optional,			// ? ??
			$.count_quantifier,	// {__} {__,} {__,__} {__}? {__,}? {__,__}?
		)),
		_invalid__quantifier: $ => choice(
			/\{\}/,
			/\{,/,
			/\{[0-9]*[^0-9,}]/,
			/\{[0-9]+,[0-9]*[^0-9}]/,
		),
		_invalid__secondary_quantifier: $ => choice(
			/[?*+{]/,
			///\{[0-9]+\}/,
			///\{[0-9]+,[0-9]*\}/,
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
		
		
		backreference: $ => prec(1, choice(
			seq(
				'\\',
				/[1-9][0-9]*/
			),
			seq(
				'\\k<',
				$.group_name,
				'>',
			),
		)),
		_invalid__backreference: $ => choice(
			'\\k<>',
			seq(
				'\\k<',
				optional(
					///[\p{ID_Start}$_]/,
					/[a-zA-Z0-9_$]/,
				),
				$._invalid__group_name_part,
			),
		),
		
		
		//#####  groups  #####
		
		
		named_capturing_group: groupRule($ => choice(
			$.named_capturing_group_identifier,
			seq(
				'?<',
				optional($._invalid__group_name),
				'>',
			),
		)),
		named_capturing_group_identifier: $ => seq(
			'?<',
			$.group_name,
			'>',
		),
		
		//TODO: Tree-sitter doesn't support Unicode property escapes, so I can't reasonably make this match the spec.
		// https://tc39.es/proposal-regexp-named-groups/
		// http://www.unicode.org/reports/tr31/#Table_Lexical_Classes_for_Identifiers
		group_name: $ => prec(1, seq(
			choice(
				///[\p{ID_Start}$_]/,
				/[a-zA-Z0-9_$]/,
				$.unicode_escape,
			),
			repeat(
				choice(
					///[\p{ID_Continue}$_\u200C\u200D]/,
					/[a-zA-Z0-9$_]/,
					$.unicode_escape,
				),
			),
		)),
		_invalid__group_name: $ => seq(
			optional(
				///[\p{ID_Start}$_]/,
				/[a-zA-Z0-9_$]/,
			),
			repeat1($._invalid__group_name_part),
			repeat(choice(
				///[\p{ID_Continue}$_\u200C\u200D]/,
				/[a-zA-Z0-9$_]/,
				$._unicode_escape,
			)),
		),
		_invalid__group_name_part: $ => seq(
			repeat(choice(
				///[\p{ID_Continue}$_\u200C\u200D]/,
				/[a-zA-Z0-9$_]/,
				$._unicode_escape,
			)),
			///[^\p{ID_Continue}$_\u200C\u200D>]/,
			/[^a-zA-Z0-9$_>]/,
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
						$.set_atom,
						optional(alias('-', $.non_syntax_character)),	//otherwise, a hyphen at the end of the character set would be an error (e.g., `[a-]`) - TODO: why is it an error???
					),
				)),
			),
			alias(']', $.set_end),
		),
		
		set_range: $ => seq(
			$.set_range_atom,
			alias('-', $.range_delimiter),
			$.set_range_atom,
		),
		
		set_range_atom: $ => choice(
			prec(1, choice(
				alias(/[^\\\]]/, $.non_syntax_character),		// NOT: \ ]
				$.character_escape,	
				alias('\\b', $.special_escape),
				$._invalid__in_set__character_escape,
			)),
			$.identity_escape,
			alias($.set_identity_escape, $.identity_escape),	// \-
			$._invalid__identity_escape,
		),
		
		set_atom: $ => choice(
			prec(1, choice(
				alias(/[^\\\]]/, $.non_syntax_character),		// NOT: \ ]
				$.character_escape,
				alias('\\b', $.special_escape),
				$._invalid__in_set__character_escape,
				$.character_class_escape,
				$._invalid__in_set__character_class_escape,
			)),
			$.identity_escape,
			alias($.set_identity_escape, $.identity_escape),	// \-
			$._invalid__identity_escape,
		),
		
		set_identity_escape: $ => seq(
			alias($._escape_operator, $.escape_operator),
			'-',
		),
			
		
		//#####  character class escapes  #####
		
		
		character_class_escape: $ => prec(1, choice(
			/\\[dDsSwW]/,
			seq(
				/\\[pP]\{/,
				choice(
					alias(/[a-zA-Z_0-9]+/, $.unicode_property_value),
					seq(
						alias(/[a-zA-Z_0-9]+/, $.unicode_property_name),
						alias('=', $.unicode_property_operator),
						alias(/[a-zA-Z_0-9]+/, $.unicode_property_value),
					),
				),
				'}',
			),
		)),
		_invalid__character_class_escape: $ => choice(
			seq(
				/\\[pP]/,
				optional(/[^\\\[(){|]/),
			),
			seq(
				/\\[pP]\{/,
				'}',
			),
			seq(
				/\\[pP]\{/,
				optional(choice(
					/[a-zA-Z_0-9]+/,
					seq(
						/[a-zA-Z_0-9]+/,
						'=',
					),
					seq(
						/[a-zA-Z_0-9]+/,
						'=',
						/[a-zA-Z_0-9]+/,
					),
				)),
				optional(/[^a-zA-Z_0-9\\\[(){|}]/),
			),
		),
		_invalid__in_set__character_class_escape: $ => choice(
			seq(
				/\\[pP]/,
				optional(/[^\\\]]/),
			),
			seq(
				/\\[pP]\{/,
				'}',
			),
			seq(
				/\\[pP]\{/,
				optional(choice(
					seq(
						/[a-zA-Z_0-9]+/,
					),
					seq(
						/[a-zA-Z_0-9]+/,
						'=',
					),
					seq(
						/[a-zA-Z_0-9]+/,
						'=',
						/[a-zA-Z_0-9]+/,
					),
				)),
				/[^a-zA-Z_0-9\\\]}]/,
			),
		),

		
		
		//#####  character escapes  #####
		
		
		character_escape: $ => prec(1, choice(
			$.special_escape,
			$.control_letter_escape,
			$.hexadecimal_escape,
			$.unicode_escape,
			$.null_character,
		)),
		_invalid__character_escape: $ => choice(
			$._invalid__null_character,
			$._invalid__control_letter_escape,
			$._invalid__hexadecimal_escape,
			$._invalid__unicode_escape,
		),
		_invalid__in_set__character_escape: $ => choice(
			$._invalid__null_character,
			$._invalid__in_set__control_letter_escape,
			$._invalid__in_set__hexadecimal_escape,
			$._invalid__in_set__unicode_escape,
		),
		
		//escapes that remove any special meaning of a character
		identity_escape: $ => prec(1, seq(
			alias($._escape_operator, $.escape_operator),
			/[\^$\\.*+?()\[\]{}|\/]/,	// ^ $ \ . * + ? ( ) [ ] { } | /
		)),
		_invalid__identity_escape: $ => seq(
			'\\',
			/[^\^$\\.*+?()\[\]{}|\/]/,	// ^ $ \ . * + ? ( ) [ ] { } | /
		),
		
		unicode_escape: $ => prec(1, choice(
			seq(
				'\\u',
				alias(/[a-fA-F0-9]{4}/, $.unicode_code),
			),
			seq(
				'\\u{',
				alias(/0*(?:[a-fA-F0-9]{1,5}|10[a-fA-F0-9]{4})/, $.unicode_code),
				'}',
			),
		)),
		_unicode_escape: $ => choice(
			seq(
				'\\u',
				/[a-fA-F0-9]{4}/,
			),
			seq(
				'\\u{',
				/0*(?:[a-fA-F0-9]{1,5}|10[a-fA-F0-9]{4})/,
				'}',
			),
		),
		_invalid__unicode_escape: $ => choice(
			seq(
				'\\u',
				optional(/[a-fA-F0-9]{1,3}/),
				optional(/[^a-fA-F0-9\\\[(){|]/),
			),
			seq(
				'\\u{',
				'}',
			),
			seq(
				'\\u{',
				/0*[a-fA-F0-9]{0,4}[^a-fA-F0-9\\\[(){|}]/,
			),
			seq(
				'\\u{',
				/0*(?:[a-fA-F0-9]{5}|10[a-fA-F0-9]{4})[^\\\[(){|}]?/,
			),
		),
		_invalid__in_set__unicode_escape: $ => choice(
			seq(
				'\\u',
				optional(/[a-fA-F0-9]{1,3}/),
				/[^a-fA-F0-9\\\]]/,
			),
			seq(
				'\\u{',
				'}',
			),
			seq(
				'\\u{',
				/0*[a-fA-F0-9]{0,4}[^a-fA-F0-9\\\]}]/,
			),
			seq(
				'\\u{',
				/0*(?:[a-fA-F0-9]{5}|10[a-fA-F0-9]{4})[^\\\]}]?/,
			),
		),
		
		hexadecimal_escape: $ => prec(1, seq(
			'\\x',
			alias(/[a-fA-F0-9]{2}/, $.hexadecimal_code),
		)),
		_invalid__hexadecimal_escape: $ => seq(
			'\\x',
			optional(/[a-fA-F0-9]/),
			optional(/[^a-fA-F0-9\\\[(){|]/),
		),
		_invalid__in_set__hexadecimal_escape: $ => seq(
			'\\x',
			optional(/[a-fA-F0-9]/),
			/[^a-fA-F0-9\\\]]/,
		),
		
		control_letter_escape: $ => prec(1, seq(
			'\\c',
			alias(/[a-zA-Z]/, $.control_letter_code),
		)),
		_invalid__control_letter_escape: $ => seq(
			'\\c',
			optional(/[^a-zA-Z\\\[(){|]/),
		),
		_invalid__in_set__control_letter_escape: $ => seq(
			'\\c',
			/[^a-zA-Z\\\]]/,
		),
		
		_invalid__null_character: $ => /\\0[0-9]/,
		
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
