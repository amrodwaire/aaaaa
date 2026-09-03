import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type Doc = {
  id: string;
  title: string;
  content: string;
};

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
};

const stopWords = new Set([
  'من',
  'في',
  'على',
  'الى',
  'عن',
  'هو',
  'هي',
  'ما',
  'هل',
  'أنا',
  'انت',
  'إيه',
  'ايه',
]);

function normalize(value: string) {
  return value.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

function getAnswer(question: string, docs: Doc[]) {
  if (!docs.length) {
    return 'ارفع ملف استشارات أولًا لكي أستطيع الإجابة منه.';
  }

  const terms = normalize(question)
    .split(' ')
    .filter((term) => term.length > 2 && !stopWords.has(term));

  if (!terms.length) {
    return 'اكتب سؤالًا أوضح قليلًا لكي أستطيع البحث في المحتوى.';
  }

  const scored = docs
    .map((doc) => {
      const normalizedDoc = normalize(doc.content);
      const score = terms.reduce((count, term) => (normalizedDoc.includes(term) ? count + 1 : count), 0);
      return { doc, score };
    })
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.score === 0) {
    return 'لم أجد إجابة مباشرة داخل الملفات المرفوعة، جرّب سؤالًا بصياغة مختلفة.';
  }

  const lines = best.doc.content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const bestLine =
    lines.find((line) => terms.some((term) => normalize(line).includes(term))) ?? best.doc.content.slice(0, 220);

  return `بحسب ملف "${best.doc.title}":\n${bestLine}`;
}

export default function App() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [fileTitle, setFileTitle] = useState('');
  const [fileContent, setFileContent] = useState('');
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: 'مرحبًا، ارفع نص ملف استشاري ثم اسألني وسأجيبك من المحتوى.',
    },
  ]);

  const canAddDoc = useMemo(() => fileTitle.trim() && fileContent.trim(), [fileContent, fileTitle]);

  const addDocument = () => {
    if (!canAddDoc) {
      return;
    }
    const nextDoc: Doc = {
      id: String(Date.now()),
      title: fileTitle.trim(),
      content: fileContent.trim(),
    };
    setDocs((prev) => [nextDoc, ...prev]);
    setFileTitle('');
    setFileContent('');
  };

  const ask = () => {
    if (!question.trim()) {
      return;
    }
    const userMessage: ChatMessage = { id: `u-${Date.now()}`, role: 'user', text: question.trim() };
    const answer = getAnswer(question, docs);
    const assistantMessage: ChatMessage = { id: `a-${Date.now() + 1}`, role: 'assistant', text: answer };
    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setQuestion('');
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>مستشار نفسي بالذكاء الاصطناعي</Text>
          <Text style={styles.subtitle}>نسخة أولية: ارفع محتوى الملف كنص ثم اسأل.</Text>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>رفع محتوى ملف</Text>
            <TextInput
              value={fileTitle}
              onChangeText={setFileTitle}
              placeholder="اسم الملف"
              style={styles.input}
              placeholderTextColor="#8f97b2"
            />
            <TextInput
              value={fileContent}
              onChangeText={setFileContent}
              placeholder="الصق نص الملف هنا"
              style={[styles.input, styles.multiline]}
              multiline
              textAlignVertical="top"
              placeholderTextColor="#8f97b2"
            />
            <Pressable style={[styles.button, !canAddDoc && styles.buttonDisabled]} onPress={addDocument}>
              <Text style={styles.buttonText}>إضافة الملف</Text>
            </Pressable>
            <Text style={styles.hint}>عدد الملفات: {docs.length}</Text>
            <FlatList
              data={docs}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              renderItem={({ item }) => <Text style={styles.docItem}>• {item.title}</Text>}
              ListEmptyComponent={<Text style={styles.empty}>لا يوجد ملفات بعد.</Text>}
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>اسأل المساعد</Text>
            <TextInput
              value={question}
              onChangeText={setQuestion}
              placeholder="اكتب سؤالك هنا"
              style={styles.input}
              placeholderTextColor="#8f97b2"
            />
            <Pressable style={styles.button} onPress={ask}>
              <Text style={styles.buttonText}>إرسال السؤال</Text>
            </Pressable>
            {messages.map((message) => (
              <View
                key={message.id}
                style={[styles.message, message.role === 'assistant' ? styles.assistant : styles.user]}
              >
                <Text style={styles.messageRole}>{message.role === 'assistant' ? 'المساعد' : 'أنت'}</Text>
                <Text style={styles.messageText}>{message.text}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <StatusBar style="auto" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f2f5ff',
  },
  content: {
    padding: 18,
    gap: 14,
    paddingBottom: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1f2551',
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    color: '#5d6484',
    marginBottom: 6,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: '#e4e9ff',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1f2551',
  },
  input: {
    borderWidth: 1,
    borderColor: '#d5dcff',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#1b1f33',
    backgroundColor: '#f8f9ff',
  },
  multiline: {
    minHeight: 120,
  },
  button: {
    backgroundColor: '#3d5af1',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
  },
  hint: {
    color: '#5d6484',
    fontSize: 12,
  },
  docItem: {
    color: '#29315a',
    fontSize: 13,
  },
  empty: {
    color: '#8f97b2',
    fontSize: 13,
  },
  message: {
    padding: 10,
    borderRadius: 10,
    gap: 5,
  },
  assistant: {
    backgroundColor: '#eef2ff',
  },
  user: {
    backgroundColor: '#e8fff2',
  },
  messageRole: {
    fontWeight: '700',
    color: '#253055',
    fontSize: 12,
  },
  messageText: {
    color: '#1f2541',
    lineHeight: 20,
  },
});
