import {
  createConnection,
  TextDocuments,
  Diagnostic,
  DiagnosticSeverity,
  ProposedFeatures,
  InitializeParams,
  DidChangeConfigurationNotification,
  CompletionItem,
  CompletionItemKind,
  TextDocumentPositionParams,
  TextDocumentSyncKind,
  InitializeResult,
  CompletionParams
} from 'vscode-languageserver/node';

import {
  TextDocument
} from 'vscode-languageserver-textdocument';

import { AllEnums } from './enum/all-enums.enum';
import { ActionTriggers } from './enum/action-triggers.enum';
import { ActiveSlot } from './enum/active-slot.enum';
import { EntityType } from './enum/entity-type.enum';

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;

connection.onInitialize((params: InitializeParams) => {
  const capabilities = params.capabilities;

  // Does the client support the `workspace/configuration` request?
  // If not, we fall back using global settings.
  hasConfigurationCapability = !!(
    capabilities.workspace && !!capabilities.workspace.configuration
  );
  hasWorkspaceFolderCapability = !!(
    capabilities.workspace && !!capabilities.workspace.workspaceFolders
  );
  hasDiagnosticRelatedInformationCapability = !!(
    capabilities.textDocument &&
    capabilities.textDocument.publishDiagnostics &&
    capabilities.textDocument.publishDiagnostics.relatedInformation
  );

  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      // Tell the client that this server supports code completion.
      completionProvider: {
        resolveProvider: true,
        triggerCharacters: ['.']
      }
    }
  };
  if (hasWorkspaceFolderCapability) {
    result.capabilities.workspace = {
      workspaceFolders: {
        supported: true
      }
    };
  }
  return result;
});

connection.onInitialized(() => {
  if (hasConfigurationCapability) {
    // Register for all configuration changes.
    connection.client.register(DidChangeConfigurationNotification.type, undefined);
  }
  if (hasWorkspaceFolderCapability) {
    connection.workspace.onDidChangeWorkspaceFolders(_event => {
      connection.console.log('Workspace folder change event received.');
    });
  }

  connection.window.showInformationMessage('Isaac Repentance API Running ...');
});

// The example settings
interface ExampleSettings {
  maxNumberOfProblems: number;
}

// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.
const defaultSettings: ExampleSettings = { maxNumberOfProblems: 1000 };
let globalSettings: ExampleSettings = defaultSettings;

// Cache the settings of all open documents
const documentSettings: Map<string, Thenable<ExampleSettings>> = new Map();

connection.onDidChangeConfiguration(change => {
  if (hasConfigurationCapability) {
    // Reset all cached document settings
    documentSettings.clear();
  } else {
    globalSettings = <ExampleSettings>(
      (change.settings.languageServerExample || defaultSettings)
    );
  }

  // Revalidate all open text documents
  documents.all().forEach(validateTextDocument);
});

function getDocumentSettings(resource: string): Thenable<ExampleSettings> {
  if (!hasConfigurationCapability) {
    return Promise.resolve(globalSettings);
  }
  let result = documentSettings.get(resource);
  if (!result) {
    result = connection.workspace.getConfiguration({
      scopeUri: resource,
      section: 'languageServerExample'
    });
    documentSettings.set(resource, result);
  }
  return result;
}

// Only keep settings for open documents
documents.onDidClose(e => {
  documentSettings.delete(e.document.uri);
});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent(change => {
  validateTextDocument(change.document);
});

async function validateTextDocument(textDocument: TextDocument): Promise<void> {
  // In this simple example we get the settings for every validate run.
  const settings = await getDocumentSettings(textDocument.uri);

  // The validator creates diagnostics for all uppercase words length 2 and more
  const text = textDocument.getText();
  const pattern = /\b[A-Z]{2,}\b/g;
  let m: RegExpExecArray | null;

  let problems = 0;
  const diagnostics: Diagnostic[] = [];
  while ((m = pattern.exec(text)) && problems < settings.maxNumberOfProblems) {
    problems++;
    const diagnostic: Diagnostic = {
      severity: DiagnosticSeverity.Warning,
      range: {
        start: textDocument.positionAt(m.index),
        end: textDocument.positionAt(m.index + m[0].length)
      },
      message: `${m[0]} is all uppercase.`,
      source: 'ex'
    };
    if (hasDiagnosticRelatedInformationCapability) {
      diagnostic.relatedInformation = [
        {
          location: {
            uri: textDocument.uri,
            range: Object.assign({}, diagnostic.range)
          },
          message: 'Spelling matters'
        },
        {
          location: {
            uri: textDocument.uri,
            range: Object.assign({}, diagnostic.range)
          },
          message: 'Particularly for names'
        }
      ];
    }
    diagnostics.push(diagnostic);
  }

  // Send the computed diagnostics to VSCode.
  connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

connection.onDidChangeWatchedFiles(_change => {
  // Monitored files have change in VSCode
  connection.console.log('We received an file change event');
});

connection.onCompletion(
  (completionParams: CompletionParams): CompletionItem[] => {
    let completionItems: CompletionItem[] = [];
    const doc = documents.all().find(doc => doc.uri === completionParams.textDocument.uri);
    const line = doc?.getText({
      start: { line: completionParams.position.line, character: 0 },
      end: completionParams.position
    });

    type AllEnumsKeys = keyof typeof AllEnums;
    const allEnumsKeys = Object.keys(AllEnums) as AllEnumsKeys[];

    allEnumsKeys.map((oneEnum: string) => {
      completionItems.push({
        label: oneEnum,
        kind: CompletionItemKind.Enum,
        data: AllEnums[oneEnum as keyof typeof AllEnums]
      });
    });

    if (line?.endsWith('ActionTriggers.')) {
      type ActionTriggersKeys = keyof typeof ActionTriggers;
      const actionTriggersKeys = Object.keys(ActionTriggers) as ActionTriggersKeys[];
      completionItems = [];

      actionTriggersKeys.map((actionTrigger: string) => {
        completionItems.push({
          label: actionTrigger,
          kind: CompletionItemKind.EnumMember,
          data: ActionTriggers[actionTrigger as keyof typeof ActionTriggers]
        });
      });
    }

    if (line?.endsWith('ActiveSlot.')) {
      type ActiveSlotKeys = keyof typeof ActiveSlot;
      const activeSlotKeys = Object.keys(ActiveSlot) as ActiveSlotKeys[];
      completionItems = [];

      activeSlotKeys.map((activeSlot: string) => {
        if (ActiveSlot[+activeSlot]) {
          completionItems.push({
            label: `${ActiveSlot[+activeSlot]}`,
            kind: CompletionItemKind.EnumMember,
            data: activeSlot
          });
        }
      });
    }

    if (line?.endsWith('EntityType.')) {
      type EntityTypeKeys = keyof typeof EntityType;
      const entityTypeKeys = Object.keys(EntityType) as EntityTypeKeys[];
      completionItems = [];

      entityTypeKeys.map((entityType: string) => {
        if (EntityType[+entityType]) {
          completionItems.push({
            label: `${EntityType[+entityType]}`,
            kind: CompletionItemKind.EnumMember,
            data: entityType
          });
        }
      });
    }

    return completionItems;
  }
);

connection.onCompletionResolve(
  (item: CompletionItem): CompletionItem => {
    item.detail = item.data
    return item;
  }
);

documents.listen(connection);
connection.listen();