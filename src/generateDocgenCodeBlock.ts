import path from "path";
import ts, {
  factory,
  StringLiteral,
  NumericLiteral,
  TrueLiteral,
  FalseLiteral,
} from "typescript";
import { ComponentDoc, PropItem } from "react-docgen-typescript/lib/parser.js";

export interface GeneratorOptions {
  filename: string;
  source: string;
  componentDocs: ComponentDoc[];
  docgenCollectionName: string | null;
  setDisplayName: boolean;
  typePropName: string;
}

function createDisplayNameIdentifier(displayName: string) {
  const cleanDisplayName = displayName.replace("default.", "");
  return factory.createIdentifier(cleanDisplayName);
}

export default function generateDocgenCodeBlock(
  options: GeneratorOptions,
): string {
  const sourceFile = ts.createSourceFile(
    options.filename,
    options.source,
    ts.ScriptTarget.ESNext,
  );

  const relativeFilename = path
    .relative("./", path.resolve("./", options.filename))
    .replace(/\\/g, "/");

  const wrapInTryStatement = (statements: ts.Statement[]): ts.TryStatement =>
    factory.createTryStatement(
      factory.createBlock(statements, true),
      factory.createCatchClause(
        factory.createVariableDeclaration(
          factory.createIdentifier("__react_docgen_typescript_loader_error"),
        ),
        factory.createBlock([]),
      ),
      undefined,
    );

  const codeBlocks = options.componentDocs.map(d =>
    wrapInTryStatement([
      options.setDisplayName ? setDisplayName(d) : null,
      setComponentDocGen(d, options),
      options.docgenCollectionName != null
        ? insertDocgenIntoGlobalCollection(
            d,
            options.docgenCollectionName,
            relativeFilename,
          )
        : null,
    ].filter(s => s !== null) as ts.Statement[]),
  );

  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
  const printNode = (sourceNode: ts.Node) =>
    printer.printNode(ts.EmitHint.Unspecified, sourceNode, sourceFile);

  // Concat original source code with code from generated code blocks.
  const result = codeBlocks.reduce(
    (acc, node) => `${acc}\n${printNode(node)}`,

    // Use original source text rather than using printNode on the parsed form
    // to prevent issue where literals are stripped within components.
    // Ref: https://github.com/strothj/react-docgen-typescript-loader/issues/7
    options.source,
  );

  return result;
}

/**
 * Set component display name.
 *
 * ```
 * SimpleComponent.displayName = "SimpleComponent";
 * ```
 */
function setDisplayName(d: ComponentDoc): ts.Statement {
  return insertTsIgnoreBeforeStatement(
    factory.createExpressionStatement(
      factory.createBinaryExpression(
        factory.createPropertyAccessExpression(
          createDisplayNameIdentifier(d.displayName),
          factory.createIdentifier("displayName"),
        ),
        ts.SyntaxKind.EqualsToken,
        factory.createStringLiteral(d.displayName),
      ),
    ),
  );
}

/**
 * Sets the field `__docgenInfo` for the component specified by the component
 * doc with the docgen information.
 *
 * ```
 * SimpleComponent.__docgenInfo = {
 *   description: ...,
 *   displayName: ...,
 *   props: ...,
 * }
 * ```
 *
 * @param d Component doc.
 * @param options Generator options.
 */
function setComponentDocGen(
  d: ComponentDoc,
  options: GeneratorOptions,
): ts.Statement {
  return insertTsIgnoreBeforeStatement(
    factory.createExpressionStatement(
      factory.createBinaryExpression(
        // SimpleComponent.__docgenInfo
        factory.createPropertyAccessExpression(
          createDisplayNameIdentifier(d.displayName),
          factory.createIdentifier("__docgenInfo"),
        ),
        ts.SyntaxKind.EqualsToken,
        factory.createObjectLiteralExpression([
          // SimpleComponent.__docgenInfo.description
          factory.createPropertyAssignment(
            factory.createStringLiteral("description"),
            factory.createStringLiteral(d.description),
          ),
          // SimpleComponent.__docgenInfo.displayName
          factory.createPropertyAssignment(
            factory.createStringLiteral("displayName"),
            factory.createStringLiteral(d.displayName),
          ),
          // SimpleComponent.__docgenInfo.props
          factory.createPropertyAssignment(
            factory.createStringLiteral("props"),
            factory.createObjectLiteralExpression(
              Object.entries(d.props).map(([propName, prop]) =>
                createPropDefinition(propName, prop, options),
              ),
            ),
          ),
        ]),
      ),
    ),
  );
}

function defaultValueLiteral(
  defaultValue: string | number | boolean,
): StringLiteral | NumericLiteral | TrueLiteral | FalseLiteral {
  if (typeof defaultValue === "number") {
    return factory.createNumericLiteral(defaultValue!);
  } else if (typeof defaultValue === "boolean") {
    return defaultValue ? factory.createTrue() : factory.createFalse();
  } else {
    return factory.createStringLiteral(defaultValue!);
  }
}

/**
 * Set a component prop description.
 * ```
 * SimpleComponent.__docgenInfo.props.someProp = {
 *   defaultValue: "blue",
 *   description: "Prop description.",
 *   name: "someProp",
 *   required: true,
 *   type: "'blue' | 'green'",
 * }
 * ```
 *
 * @param propName Prop name
 * @param prop Prop definition from `ComponentDoc.props`
 * @param options Generator options.
 */
function createPropDefinition(
  propName: string,
  prop: PropItem,
  options: GeneratorOptions,
) {
  /**
   * Set default prop value.
   *
   * ```
   * SimpleComponent.__docgenInfo.props.someProp.defaultValue = null;
   * SimpleComponent.__docgenInfo.props.someProp.defaultValue = {
   *   value: "blue",
   * };
   * ```
   *
   * @param defaultValue Default prop value or null if not set.
   */
  const setDefaultValue = (
    defaultValue: { value: string | number | boolean } | null,
  ) =>
    factory.createPropertyAssignment(
      factory.createStringLiteral("defaultValue"),
      // Use a more extensive check on defaultValue. Sometimes the parser
      // returns an empty object.
      defaultValue != null &&
        typeof defaultValue === "object" &&
        "value" in defaultValue &&
        (typeof defaultValue.value === "string" ||
          typeof defaultValue.value === "number" ||
          typeof defaultValue.value === "boolean")
        ? factory.createObjectLiteralExpression([
            factory.createPropertyAssignment(
              factory.createIdentifier("value"),
              defaultValueLiteral(defaultValue!.value),
            ),
          ])
        : factory.createNull(),
    );

  /** Set a property with a string value */
  const setStringLiteralField = (fieldName: string, fieldValue: string) =>
    factory.createPropertyAssignment(
      factory.createStringLiteral(fieldName),
      factory.createStringLiteral(fieldValue),
    );

  /**
   * ```
   * SimpleComponent.__docgenInfo.props.someProp.description = "Prop description.";
   * ```
   * @param description Prop description.
   */
  const setDescription = (description: string) =>
    setStringLiteralField("description", description);

  /**
   * ```
   * SimpleComponent.__docgenInfo.props.someProp.name = "someProp";
   * ```
   * @param name Prop name.
   */
  const setName = (name: string) => setStringLiteralField("name", name);

  /**
   * ```
   * SimpleComponent.__docgenInfo.props.someProp.required = true;
   * ```
   * @param required Whether prop is required or not.
   */
  const setRequired = (required: boolean) =>
    factory.createPropertyAssignment(
      factory.createStringLiteral("required"),
      required ? factory.createTrue() : factory.createFalse(),
    );

  /**
   * ```
   * SimpleComponent.__docgenInfo.props.someProp.type = {
   *  name: "enum",
   *  value: [ { value: "\"blue\"" }, { value: "\"green\""} ]
   * }
   * ```
   * @param [typeValue] Prop value (for enums)
   */
  const setValue = (typeValue?: any) =>
    Array.isArray(typeValue) &&
    typeValue.every(value => typeof value.value === "string")
      ? factory.createPropertyAssignment(
          factory.createStringLiteral("value"),
          factory.createArrayLiteralExpression(
            typeValue.map(value =>
              factory.createObjectLiteralExpression([
                setStringLiteralField("value", value.value),
              ]),
            ),
          ),
        )
      : undefined;

  /**
   * ```
   * SimpleComponent.__docgenInfo.props.someProp.type = { name: "'blue' | 'green'"}
   * ```
   * @param typeName Prop type name.
   * @param [typeValue] Prop value (for enums)
   */
  const setType = (typeName: string, typeValue?: any) => {
    const objectFields = [setStringLiteralField("name", typeName)];
    const valueField = setValue(typeValue);

    if (valueField) {
      objectFields.push(valueField);
    }

    return factory.createPropertyAssignment(
      factory.createStringLiteral(options.typePropName),
      factory.createObjectLiteralExpression(objectFields),
    );
  };

  return factory.createPropertyAssignment(
    factory.createStringLiteral(propName),
    factory.createObjectLiteralExpression([
      setDefaultValue(prop.defaultValue),
      setDescription(prop.description),
      setName(prop.name),
      setRequired(prop.required),
      setType(prop.type.name, prop.type.value),
    ]),
  );
}

/**
 * Adds a component's docgen info to the global docgen collection.
 *
 * ```
 * if (typeof STORYBOOK_REACT_CLASSES !== "undefined") {
 *   STORYBOOK_REACT_CLASSES["src/.../SimpleComponent.tsx"] = {
 *     name: "SimpleComponent",
 *     docgenInfo: SimpleComponent.__docgenInfo,
 *     path: "src/.../SimpleComponent.tsx",
 *   };
 * }
 * ```
 *
 * @param d Component doc.
 * @param docgenCollectionName Global docgen collection variable name.
 * @param relativeFilename Relative file path of the component source file.
 */
function insertDocgenIntoGlobalCollection(
  d: ComponentDoc,
  docgenCollectionName: string,
  relativeFilename: string,
): ts.Statement {
  return insertTsIgnoreBeforeStatement(
    factory.createIfStatement(
      factory.createBinaryExpression(
        factory.createTypeOfExpression(
          factory.createIdentifier(docgenCollectionName),
        ),
        ts.SyntaxKind.ExclamationEqualsEqualsToken,
        factory.createStringLiteral("undefined"),
      ),
      insertTsIgnoreBeforeStatement(
        factory.createExpressionStatement(
          factory.createBinaryExpression(
            factory.createElementAccessExpression(
              factory.createIdentifier(docgenCollectionName),
              factory.createStringLiteral(
                `${relativeFilename}#${d.displayName}`,
              ),
            ),
            ts.SyntaxKind.EqualsToken,
            factory.createObjectLiteralExpression([
              factory.createPropertyAssignment(
                factory.createIdentifier("docgenInfo"),
                factory.createPropertyAccessExpression(
                  createDisplayNameIdentifier(d.displayName),
                  factory.createIdentifier("__docgenInfo"),
                ),
              ),
              factory.createPropertyAssignment(
                factory.createIdentifier("name"),
                factory.createStringLiteral(d.displayName),
              ),
              factory.createPropertyAssignment(
                factory.createIdentifier("path"),
                factory.createStringLiteral(
                  `${relativeFilename}#${d.displayName}`,
                ),
              ),
            ]),
          ),
        ),
      ),
    ),
  );
}

/**
 * Inserts a ts-ignore comment above the supplied statement.
 *
 * It is used to work around type errors related to fields like __docgenInfo not
 * being defined on types. It also prevents compile errors related to attempting
 * to assign to nonexistent components, which can happen due to incorrect
 * detection of component names when using the parser.
 * ```
 * // @ts-ignore
 * ```
 * @param statement
 */
function insertTsIgnoreBeforeStatement(statement: ts.Statement): ts.Statement {
  ts.setSyntheticLeadingComments(statement, [
    {
      text: " @ts-ignore", // Leading space is important here
      kind: ts.SyntaxKind.SingleLineCommentTrivia,
      pos: -1,
      end: -1,
    },
  ]);
  return statement;
}
