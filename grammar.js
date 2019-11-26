const quantifierRule = prefix => $ => seq(
	prefix($),
	optional(alias('?', $.lazy))
)

const lookaroundRule = identifier => $ => seq(
	$.group_begin,
	identifier($),
	optional($.pattern),
	$.group_end
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
		$.null_character	// \0  (not followed by 0-9)
	],
	
	extras: $ => [],
	
	conflicts: $ => [
	],
	
	inline: $ => [
		$.pattern,
		$.unit,
		$.quantifier,
		$.set_atom,
		$.character_escape,
		$.unicode_property_expression
	],
	
	rules: {
		regex: $ => $.pattern,
		
		pattern: $ => seq(
			repeat1(seq(
				$.unit,
				optional($.quantifier)
			)),
			optional($.disjunction)
		),
		
		disjunction: $ => seq(
			$.disjunction_delimiter,
			optional($.pattern)
		),
		disjunction_delimiter: $ => '|',
		
		unit: $ => choice(
			$._pattern_character,						// NOT: ^ $ \ . * + ? ( ) [ ] { } | / or newline
			$.any_character,							// .
			$.start_assertion,							// ^
			$.end_assertion,							// $
			$.boundary_assertion,						// \b
			$.non_boundary_assertion,					// \B
			$.character_escape,							// \f \n \r \t \v \c__ \x__ \u__ \u{__} \0 \^ \$ \\ \. \* \+ \? \( \) \[ \] \{ \} \| \/
			$.character_class_escape,					// \d \D \s \S \w \W \p{__} \P{__} \p{__=__}
			$.backreference_escape,						// \1 ... \9 \1__ ... \9__ \k<__>
			alias($.character_set, $.character_class),	// [__] [^__]
			$.anonymous_capturing_group,				// (__)
			$.non_capturing_group,						// (?:__)
			$.named_capturing_group,					// (?<__>__)
			$.lookahead_assertion,						// (?=__)
			$.negative_lookahead_assertion,				// (?!__)
			$.lookbehind_assertion,						// (?<=__)
			$.negative_lookbehind_assertion				// (?<!__)
		),
		
		
		//#####  quantifiers  #####
		
		
		quantifier: $ => choice(
			$.zero_or_more,		// * *?
			$.one_or_more,		// + +?
			$.optional,			// ? ??
			$.count_quantifier	// {__} {__,} {__,__} {__}? {__,}? {__,__}?
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
					optional(alias(/[0-9]+/, $.count_quantifier_value))
				))
			),
			'}'
		)),
		
		
		//#####  lookaround assertions  #####
		
		
		lookahead_assertion: lookaroundRule($ => alias('?=', $.lookahead_identifier)),
		negative_lookahead_assertion: lookaroundRule($ => alias('?!', $.negative_lookahead_identifier)),
		lookbehind_assertion: lookaroundRule($ => alias('?<=', $.lookbehind_identifier)),
		negative_lookbehind_assertion: lookaroundRule($ => alias('?<!', $.negative_lookbehind_identifier)),
		
		
		//#####  backreferences  #####
		
		
		backreference_escape: $ => choice(
			seq('\\', /[1-9][0-9]*/),
			seq('\\k<', $.group_name, '>')
		),
		
		
		//#####  groups  #####
		
		
		named_capturing_group: $ => seq(
			$.group_begin,
			$.named_capturing_group_identifier,
			optional($.pattern),
			$.group_end
		),
		named_capturing_group_identifier: $ => seq(
			'?<',
			$.group_name,
			'>'
		),
		
		// TODO: This seems to match what Chrome allows for group names, but make this match the spec.
		// https://tc39.es/proposal-regexp-named-groups/
		// http://www.unicode.org/reports/tr31/#Table_Lexical_Classes_for_Identifiers
		group_name: $ => seq(
			choice(
				$._name_first_char,
				$.unicode_escape
			),
			repeat(
				choice(
					$._name_additional_char,
					$.unicode_escape
				)
			)
		),
		_name_first_char: $ => /[a-zA-Z0-9_$]/,
		_name_additional_char: $ => /[a-zA-Z0-9_$\u200C\u200D]/,
		
		non_capturing_group: $ => seq(
			$.group_begin,
			$.non_capturing_group_identifier,
			optional($.pattern),
			$.group_end
		),
		non_capturing_group_identifier: $ => '?:',
		
		anonymous_capturing_group: $ => seq(
			$.group_begin,
			optional($.pattern),
			$.group_end
		),
		
		group_begin: $ => '(',
		group_end: $ => ')',
		
		
		//#####  character sets  #####
		
		
		character_set: $ => seq(
			alias('[', $.set_begin),
			optional(alias('^', $.set_negation)),
			repeat(
				prec.right(choice(
					$.character_range,
					seq(
						$.set_atom,
						'-'
					),
					$.set_atom,
					'-'
				))
			),
			alias(']', $.set_end)
		),
		
		character_range: $ => seq(
			choice($.set_atom, '-'),
			alias('-', $.range_delimiter),
			choice($.set_atom, '-')
		),
		
		set_atom: $ => choice(
			$._set_character,
			$.character_escape,
			alias('\\b', $.special_escape),
			$.character_class_escape,
			alias($.set_identity_escape, $.identity_escape)
		),
		
		set_identity_escape: $ => seq(
			$.escape_operator,
			'-'
		),
		
		_set_character: $ => /[^\\\]\-]/,	// NOT: \ ] -
			
		
		//#####  character class escapes  #####
		
		
		character_class_escape: $ => choice(
			/\\[dDsSwW]/,
			seq(
				/\\[pP]\{/,
				$.unicode_property_expression,
				'}'
			)
		),
		unicode_property_expression: $ => seq(
			optional(seq(
				alias($._unicode_property, $.unicode_property_name),
				alias('=', $.unicode_property_operator)
			)),
			alias($._unicode_property, $.unicode_property_value)
		),
		_unicode_property: $ => /[a-zA-Z_0-9]+/,
		
		
		//#####  character escapes  #####
		
		
		character_escape: $ => choice(
			$.special_escape,
			$.control_letter_escape,
			$.hexadecimal_escape,
			$.unicode_escape,
			$.identity_escape,
			$.null_character
		),
		
		//escapes that remove any special meaning of a character
		identity_escape: $ => seq(
			$.escape_operator,
			/[\^$\\.*+?()\[\]{}|\/]/	// ^ $ \ . * + ? ( ) [ ] { } | /
		),
		
		unicode_escape: $ => choice(
			seq(
				'\\u',
				alias(/[a-fA-F0-9]{4}/, $.unicode_code)
			),
			seq(
				'\\u{',
				alias(/0*(?:[a-fA-F0-9]{1,5}|10[a-fA-F0-9]{4})/, $.unicode_code),
				'}'
			)
		),
		
		hexadecimal_escape: $ => seq(
			'\\x',
			alias(/[a-fA-F0-9]{2}/, $.hexadecimal_code)
		),
		
		control_letter_escape: $ => seq(
			'\\c',
			alias(/[a-zA-Z]/, $.control_letter_code)
		),
		
		special_escape: $ => /\\[fnrtv]/,
		
		escape_operator: $ => '\\',
		
		
		//#####  boundary assertions  #####
		
		
		start_assertion: $ => '^',
		end_assertion: $ => '$',
		boundary_assertion: $ => '\\b',
		non_boundary_assertion: $ => '\\B',
		
		
		//#####  characters  #####
		
		
		any_character: $ => '.',
		
		//non-syntax characters
		_pattern_character: $ => /[^\^$\\.*+?()\[\]{}|\/\n]/	// NOT: ^ $ \ . * + ? ( ) [ ] { } | / or newline
	}
})
