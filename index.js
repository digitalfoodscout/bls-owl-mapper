"use strict";

const cheerio = require('cheerio');
const fs = require('fs');
const xml2js = require('xml2js');

const header = `[PrefixDeclaration]
:               http://digitalfoodscout.me/dfs_ontology#
owl:            http://www.w3.org/2002/07/owl#
rdf:            http://www.w3.org/1999/02/22-rdf-syntax-ns#
xml:            http://www.w3.org/XML/1998/namespace
xsd:            http://www.w3.org/2001/XMLSchema#
rdfs:           http://www.w3.org/2000/01/rdf-schema#

[SourceDeclaration]
sourceUri       datasource1
connectionUrl   jdbc:mysql://localhost/foodscout
username        root
password        foodscout
driverClass     com.mysql.jdbc.Driver

[MappingDeclaration] @collection [[\n`;

function replaceForbiddenCharacters(text) {
    let result = text;
    result = result.replace(/[ /]/g, '_');
    result = result.replace(/[(),]/g, '');
    result = result.replace(/</g, 'lt');
    result = result.replace(/>/g, 'gt');
    result = result.replace(/\+/g, '_und_');
    result = result.replace(/%/g, '_Prozent');

    // Replace multiple underscores with a single underscore
    result = result.replace(/_+/g, '_');

    return result;
}

function litomapping(id, text) {
    return `mappingId       MAPID-${id}-${text}
target          :${text}{SBLS} a :${text} ; :lactose {KDL} ; :key {SBLS} . 
source          SELECT SBLS,KDL FROM food WHERE \`SBLS\` REGEXP '^${id}.*'`
}

const parser = new xml2js.Parser();

fs.readFile('classes.html', (err, data) => {
    const $ = cheerio.load(data, {normalizeWhitespace: true});

    const uls = $('ul');
    const ps = $('p');

    let output = header;

    fs.readFile(__dirname + '/base.owl', function (err, base) {
        parser.parseString(base, function (err, ontology) {
            uls.each((i, ul) => {
                // Get top level category
                let topcat = $(ps[i]).text().substr(4).trim();
                topcat = replaceForbiddenCharacters(topcat);

                ontology.Ontology.Declaration.push({
                    Class: [{$: {IRI: `#${topcat}`}}]
                });

                ontology.Ontology.SubClassOf.push({
                    Class: [
                        {$: {IRI: `#${topcat}`}},
                        {$: {IRI: "#Lebensmittel"}},
                    ]
                });

                $(ul).children().each((j, li) => {
                    const category = $(li).text().trim();

                    const id = category.substr(0, 2);
                    let text = replaceForbiddenCharacters(category.substr(3));

                    if (text === "Andere_und_ohne_Angaben") {
                        text = `Andere_${topcat}_und_ohne_Angaben`;
                    }

                    if(text === "-") {
                        return;
                    }

                    ontology.Ontology.Declaration.push({
                        Class: [{$: {IRI: `#${text}`}}]
                    });

                    ontology.Ontology.SubClassOf.push({
                        Class: [
                            {$: {IRI: `#${text}`}},
                            {$: {IRI: `#${topcat}`}},
                        ]
                    });

                    output += litomapping(id, text);
                    output += "\n\n";
                });
            });

            output += "]]";

            fs.writeFileSync('mappedOntology.obda', output);

            const builder = new xml2js.Builder();
            const xml = builder.buildObject(ontology);

            fs.writeFileSync('mappedOntology.owl', xml);
        });
    });
});