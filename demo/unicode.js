let a = `
Two code points: 𐀀😀
𐀀1𐀀2𐀀3𐀀4𐀀5𐀀6😀7😀8
aaaaaaaaaaaaa

Two code points and rtl:
בְּרֵאשִׁית, בָּרָא אֱלֹהִים, אֵת הַשָּׁמַיִם, וְאֵת הָאָרֶץ
aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa

Wide chars: 台北ＱＲＳ
台1北2Ｑ3Ｒ4Ｓ5
aaaaaaaaaaaaa

Narrow chars: ｱｲｳ
ｱ1ｲ2ｳ3
aaaaaa
`;

// Some highlight testing below.
for (let i = 0; i < '𐀀1𐀀2𐀀3𐀀4𐀀5𐀀6'.length; i++) {
  let x = Math.max(new String('בְּרֵאשִׁית, בָּרָא אֱלֹהִים, אֵת הַשָּׁמַיִם, וְאֵת הָאָרֶץ').length, Math.min(5, 7));
  let y = Math.max(new String('台1北2Ｑ3Ｒ4Ｓ5').length, Math.min(5, 7));
  let z = Math.max(new String('ｱ1ｲ2ｳ3').length, Math.min(5, 7));
}

// Some search testing below.
// Search for 'findme', '2Ｑ3' and '𐀀'.
for (let findme = 0; findme < '𐀀findme𐀀2𐀀2Ｑ3𐀀4𐀀findme𐀀6'.length; findme++) {
  let x = Math.max(new String('בְּרֵאשִׁית, בָּרָא אֱלֹהִים, אֵת הַשָּׁ𐀀מַיִםfindme, וְאֵת הָאָרֶץ').length, Math.min(findme, 7));
  let y = Math.max(new String('台findme北2Ｑ3ＲfindmeＳ5𐀀').length, Math.min(5, 7));
  let z = Math.max(findme, new String('ｱ1ｲfindmeｳ3 2Ｑ3').length);
}

