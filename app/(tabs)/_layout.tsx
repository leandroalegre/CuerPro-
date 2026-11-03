import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BotonLetra } from '../../components/BotonLetra';
import { useLetra } from '../../components/Letra';
import { SelectorEspacio } from '../../components/SelectorEspacio';
import { Colors } from '../../constants/theme';

export default function TabLayout() {
  const { tam, escala } = useLetra();
  const { bottom } = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors.accent,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarStyle: {
          backgroundColor: Colors.bgCard, borderTopColor: Colors.border,
          // Con letra más grande la barra crece para que entren los nombres
          ...(escala !== 1 && { height: tam(52) + bottom, paddingBottom: bottom + 4 }),
        },
        headerStyle: { backgroundColor: Colors.bgCard },
        headerTintColor: Colors.textPrimary,
        headerTitleStyle: { fontSize: tam(17) },
        tabBarLabelStyle: { fontSize: tam(10) },
        headerRight: () => (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <BotonLetra />
            <SelectorEspacio />
          </View>
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Hoy',
          tabBarIcon: ({ color, size }) => <Ionicons name="calendar" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="entrenar"
        options={{
          title: 'Entrenar',
          tabBarIcon: ({ color, size }) => <Ionicons name="barbell" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="plan"
        options={{
          title: 'Plan',
          tabBarIcon: ({ color, size }) => <Ionicons name="list" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="progreso"
        options={{
          title: 'Progreso',
          tabBarIcon: ({ color, size }) => <Ionicons name="trophy" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="grupos"
        options={{
          title: 'Grupos',
          tabBarIcon: ({ color, size }) => <Ionicons name="people" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
