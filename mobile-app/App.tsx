import { StatusBar } from 'expo-status-bar';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { useState } from 'react';
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
  const [question, setQuestion] = useState('');
  const [backendUrl, setBackendUrl] = useState('http://127.0.0.1:8787');
  const [isLoading, setIsLoading] = useState(false);
  const [isPickingFile, setIsPickingFile] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: 'مرحبًا، ارفع ملفًا نصيًا كاملًا ثم اسألني وسأجيبك من المحتوى.',
    },
  ]);

  const addDocument = (title: string, content: string) => {
    const nextDoc: Doc = {
      id: String(Date.now()),
      title: title.trim().slice(0, 120) || 'بدون اسم',
      content: content.trim(),
    };
    setDocs((prev) => [nextDoc, ...prev]);
  };

  const pickDocument = async () => {
    setUploadError('');
    setIsPickingFile(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'text/*',
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.length) {
        return;
      }

      const file = result.assets[0];
      const fileContent = await FileSystem.readAsStringAsync(file.uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      if (!fileContent.trim()) {
        setUploadError('الملف فارغ أو لا يمكن قراءة محتواه كنص.');
        return;
      }

      addDocument(fileTitle || file.name || 'بدون اسم', fileContent);
      setFileTitle('');
    } catch {
      setUploadError('تعذر رفع الملف. تأكد أن الملف نصي وحاول مرة أخرى.');
    } finally {
      setIsPickingFile(false);
    }
  };

  const askBackend = async (prompt: string) => {
    const normalizedBase = backendUrl.trim().replace(/\/+$/, '');
    if (!normalizedBase) {
      return null;
    }

    const response = await fetch(`${normalizedBase}/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: prompt,
        docs: docs.map((doc) => ({ title: doc.title, content: doc.content })),
      }),
    });

    if (!response.ok) {
      throw new Error(`Backend error: ${response.status}`);
    }

    const data: { answer?: string } = await response.json();
    return data.answer ?? null;
  };

  const ask = async () => {
    if (!question.trim()) {
      return;
    }
    const prompt = question.trim();
    const userMessage: ChatMessage = { id: `u-${Date.now()}`, role: 'user', text: prompt };
    setMessages((prev) => [...prev, userMessage]);
    setQuestion('');
    setIsLoading(true);

    try {
      const backendAnswer = await askBackend(prompt);
      const answer = backendAnswer ?? getAnswer(prompt, docs);
      const assistantMessage: ChatMessage = { id: `a-${Date.now() + 1}`, role: 'assistant', text: answer };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch {
      const fallback = getAnswer(prompt, docs);
      const assistantMessage: ChatMessage = {
        id: `a-${Date.now() + 1}`,
        role: 'assistant',
        text: `تعذر الوصول للـ API، فتم استخدام الإجابة المحلية:\n${fallback}`,
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>مستشار نفسي بالذكاء الاصطناعي</Text>
          <Text style={styles.subtitle}>نسخة أولية: ارفع ملفًا نصيًا كاملًا ثم اسأل.</Text>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>إعداد الربط مع Backend</Text>
            <TextInput
              value={backendUrl}
              onChangeText={setBackendUrl}
              placeholder="http://127.0.0.1:8787"
              style={styles.input}
              placeholderTextColor="#8f97b2"
              autoCapitalize="none"
            />
            <Text style={styles.hint}>ضع عنوان السيرفر الذي يحتوي على API endpoint: /ask</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>رفع ملف كامل</Text>
            <TextInput
              value={fileTitle}
              onChangeText={setFileTitle}
              placeholder="اسم اختياري للملف (أو يُستخدم اسم الملف)"
              style={styles.input}
              placeholderTextColor="#8f97b2"
            />
            <Pressable style={[styles.button, isPickingFile && styles.buttonDisabled]} onPress={pickDocument}>
              <Text style={styles.buttonText}>{isPickingFile ? 'جاري اختيار الملف...' : 'اختيار ملف نصي'}</Text>
            </Pressable>
            {!!uploadError && <Text style={styles.error}>{uploadError}</Text>}
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
            <Pressable style={[styles.button, isLoading && styles.buttonDisabled]} onPress={ask}>
              <Text style={styles.buttonText}>{isLoading ? 'جاري الإرسال...' : 'إرسال السؤال'}</Text>
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
  error: {
    color: '#c21a1a',
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
