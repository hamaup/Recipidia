import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, TouchableOpacity, StyleSheet, Text, View, TextInput, Button, Image, FlatList, Platform, Dimensions, Modal } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import StarRating from 'react-native-star-rating-widget';
import { initializeApp } from 'firebase/app';
import { getStorage, ref, uploadString, getDownloadURL, uploadBytesResumable } from "firebase/storage";
import { getDatabase, ref as dbRef, set, onValue, off } from "firebase/database";
import { PaperProvider, Card, Title, Paragraph, Chip, useTheme } from 'react-native-paper';
import data from '@emoji-mart/data'
import Picker from '@emoji-mart/react'
import { FormTokenField } from '@wordpress/components';
import { API_KEY, AUTH_DOMAIN, DATABASE_URL, PROJECT_ID, STORAGE_BUCKET, MESSAGING_SENDER_ID, APP_ID, VISION_API_KEY, API_URL } from '@env';

const firebaseConfig = {
  apiKey: API_KEY,
  authDomain: AUTH_DOMAIN,
  databaseURL: DATABASE_URL,
  projectId: PROJECT_ID,
  storageBucket: STORAGE_BUCKET,
  messagingSenderId: MESSAGING_SENDER_ID,
  appId: APP_ID
};

const Stack = createStackNavigator();

const app = initializeApp(firebaseConfig);

const storage = getStorage(app);

const db = getDatabase(app);

const HomeScreen = ({ navigation }) => {
  const [dataList, setDataList] = useState([]);

  useEffect(() => {
    const db = getDatabase(app);
    const recipesRef = dbRef(db, 'review/');
    onValue(recipesRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const recipes = Object.entries(data).map(([id, value]) => ({
          id,
          ...value,
        }));

        setDataList((prevList) => [...prevList, ...recipes.reverse()]);
      }
    });

    return () => {
      off(recipesRef);
    };
  }, []);

  const renderItem = ({ item }) => {

    return (
      <TouchableOpacity onPress={() => navigation.navigate('Details', { item: item })}>
        <View style={styles.card}>
          <Card>
            <Card.Cover source={{ uri: item.media }} />
            <Card.Content>
              <Title style={styles.title}>
                {item.recipe.length > 18 ? item.recipe.replace(/(\r\n|\n|\r)/gm, '').slice(0, 18) + '...' : item.recipe.replace(/(\r\n|\n|\r)/gm, '')}
              </Title>
            </Card.Content>
          </Card>
        </View>
      </TouchableOpacity>
    );
    //}
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={dataList}
        renderItem={renderItem}
        keyExtractor={(item, index) => index.toString()}
        numColumns={numColumns}
      />
    </View>
  );
};

function DetailsScreen({ route }) {
  const { item } = route.params;
  const [selectedEmoji, setSelectedEmoji] = useState(null);
  const [reactions, setReactions] = useState({});
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const { colors } = useTheme();

  const handleSelectAddEmoji = (emoji) => {
    setSelectedEmoji(emoji.native);
    setShowEmojiPicker(false);

    const emojiRef = dbRef(getDatabase(), `reactions/${item.id}/${emoji.native}`);
    set(emojiRef, (reactions[emoji.native] || 0) + 1);
  };

  const handleSelectEmoji = (emoji) => {
    setSelectedEmoji(emoji);
    setShowEmojiPicker(false);

    const emojiRef = dbRef(getDatabase(), `reactions/${item.id}/${emoji}`);
    set(emojiRef, (reactions[emoji] || 0) + 1);
  };

  useEffect(() => {
    const reactionsRef = dbRef(getDatabase(), `reactions/${item.id}`);
    const unsubscribe = onValue(reactionsRef, (snapshot) => {
      setReactions(snapshot.val() || {});
    });
    return unsubscribe;
  }, [item.id]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-start', backgroundColor: colors.background }}>
      <Text style={{ fontSize: 14, fontWeight: 'bold', color: colors.primary, margin: 20 }}>{item.recipe}</Text>
      <Image source={{ uri: item.media }} style={{ width: 200, height: 200, marginVertical: 20 }} />

      <Text style={{ fontSize: 14, color: colors.text }}>{item.comment}</Text>
      <Title style={{ marginTop: 20 }}>美味しさ:</Title>
      <StarRating
        disabled={true}
        maxStars={5}
        rating={item.starDelicious}
      />

      <Title style={{ marginTop: 20 }}>調理の簡単さ:</Title>
      <StarRating
        disabled={true}
        maxStars={5}
        rating={item.starEasy}
      />

      <Title style={{ marginTop: 20 }}>調理の手軽さ:</Title>
      <StarRating
        disabled={true}
        maxStars={5}
        rating={item.starConviniency}
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', margin: 20 }}>
        {Object.entries(reactions).map(([emojiId, count]) => (
          <Chip
            key={emojiId}
            onPress={() => handleSelectEmoji(emojiId)}
            style={{ margin: 4 }}
          >
            {emojiId} {count}
          </Chip>
        ))}
        <Chip
          icon="plus"
          onPress={() => setShowEmojiPicker(true)}
          style={{ margin: 4 }}
        >
          リアクション追加
        </Chip>
      </View>
      {showEmojiPicker && <Picker data={data} onEmojiSelect={handleSelectAddEmoji} />}
    </View>
  );
}



function LoadingScreen({ navigation, route }) {
  const { handlePress, params } = route.params;

  useEffect(() => {
    const fetchRecipe = async () => {
      const data = await handlePress();
      navigation.replace('Review', { result: data });
    };
    fetchRecipe();
  }, []);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="large" color="#00ff00" />
    </View>
  );
}


function RecipeScreen({ navigation }) {
  const [image, setImage] = React.useState(null);
  const [tags, setTags] = useState([]);
  const [selectCuisines, setSelectCuisines] = React.useState('指定なし');
  const [selectUseOnlyFoodstuff, setSelectUseOnlyFoodstuff] = React.useState('この食材だけ使う');
  const [loading, setLoading] = React.useState(false);

  const use_only_foodstuff = [
    "この食材だけ使う",
    "他の食材も使う",
  ];

  const cuisines = [
    "日本料理",
    "フランス料理",
    "中華料理",
    "イタリア料理",
    "メキシコ料理",
    "インド料理",
    "タイ料理",
    "スペイン料理",
    "アメリカン料理",
    "指定なし"
  ];

  const handlePress = async () => {
    try {
      const useOnlyFoodstuff = selectUseOnlyFoodstuff === "この食材だけ使う" ? 0 : 1;
      const response = await fetch(API_URL + "/api/generate-recipe", {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          value: tags,
          useOnlyFoodstuff: useOnlyFoodstuff,
          cuisines: selectCuisines,
        }),
      });
      const data = await response.json();
      return data.generatedText;
    } catch (error) {
      console.error(error);
    }
  };

  const analyzeImage = async (imageUri) => {
    setLoading(true);
    try {
      let base64Img = "";

      if (Platform.OS === 'web') {
        const response = await fetch(imageUri);
        const blob = await response.blob();
        const reader = new FileReader();
        base64Img = await new Promise((resolve, reject) => {
          reader.onloadend = () => resolve(reader.result.split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } else {
        base64Img = await FileSystem.readAsStringAsync(imageUri, {
          encoding: FileSystem.EncodingType.Base64,
        });
      }

      let apiUrl = `https://vision.googleapis.com/v1/images:annotate?key=${VISION_API_KEY}`;
      let body = JSON.stringify({
        requests: [
          {
            image: {
              content: base64Img,
            },
            features: [
              { type: 'LABEL_DETECTION', maxResults: 10 },
            ],
          },
        ],
      });

      let response = await fetch(apiUrl, {
        method: 'POST',
        body: body,
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        console.error(`HTTP error! status: ${response.status}`);
      } else {
        let data = await response.json();
        let joinedDescriptions = "";
        if (data.error) {
          console.error(data.error);
        } else {
          console.log(data.responses[0].labelAnnotations);
          const descriptions = data.responses[0].labelAnnotations
            .filter(annotation => annotation.score >= 0.75)
            .map(annotation => annotation.description);

          joinedDescriptions = descriptions.join(', ');
          console.log(joinedDescriptions);
          analyzeImageResult(joinedDescriptions);
        }
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };


  const openImagePickerAsync = async () => {
    let permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (permissionResult.granted === false) {
      alert('Permission to access camera roll is required!');
      return;
    }

    let pickerResult = await ImagePicker.launchImageLibraryAsync();
    if (pickerResult.cancelled === true) {
      return;
    }
    analyzeImage(pickerResult.uri)
  };

  const handleTagChange = (newTags) => {
    setTags(newTags);
  };

  const analyzeImageResult = async (joinedDescriptions) => {
    try {
      const response = await fetch(API_URL + "/api/analyze-image-result", {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          value: joinedDescriptions
        }),
      });
      const data = await response.json();

      if (typeof data.generatedText === 'string') {
        const tagString = data.generatedText.replace('食材名: ', '');
        const tagArray = tagString.split(",");
        setTags(tagArray);
      } else {
        console.log('generatedText is not a string');
      }

    } catch (error) {
      console.error(error);
    }
  };


  return (
    <View style={styles.container}>
      <Text>食材追加</Text>
      <View style={styles.wrapTextArea}>
        <FormTokenField
          value={tags}
          onChange={handleTagChange}
          suggestions={[]}
        />
      </View>
      <View>
        <TouchableOpacity style={styles.button} onPress={openImagePickerAsync}>
          <Text style={styles.buttonText}>画像から食材追加</Text>
        </TouchableOpacity>
        {image && <Image source={{ uri: image }} style={{ width: 200, height: 200 }} />}
      </View>
      {loading ? <ActivityIndicator size="large" color="#00ff00" /> : null}
      <View style={styles.chipContainer}>
        {use_only_foodstuff.map(use_foodstuff => (
          <Chip
            key={use_foodstuff}
            selected={selectUseOnlyFoodstuff === use_foodstuff}
            onPress={() => setSelectUseOnlyFoodstuff(use_foodstuff)}
            style={styles.chip}
          >
            {use_foodstuff}
          </Chip>
        ))}
      </View>
      <View style={styles.chipContainer}>
        {cuisines.map(cuisine => (
          <Chip
            key={cuisine}
            selected={selectCuisines === cuisine}
            onPress={() => setSelectCuisines(cuisine)}
            style={styles.chip}
          >
            {cuisine}
          </Chip>
        ))}
      </View>
      <TouchableOpacity style={styles.button} onPress={() => navigation.navigate('Loading', { handlePress })}>
        <Text style={styles.buttonText}>レシピ作成</Text>
      </TouchableOpacity>
      <StatusBar style="auto" />
    </View >
  );
}


function ReviewScreen({ route }) {

  const { result } = route.params;
  const [image, setImage] = useState(null);
  const [comment, setComment] = useState("");
  const [starDelicious, setStarDelicious] = useState(0);
  const [starEasy, setStarEasy] = useState(0);
  const [starConviniency, setStarConviniency] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
    });

    if (!result.cancelled) {
      setImage(result.uri);
    }
  };

  const handleSubmit = async () => {

    setIsLoading(true);

    const storageRef = ref(storage, `images/${Date.now()}.jpg`);
    const contentType = 'image/jpeg';

    uploadString(storageRef, image, 'data_url');

    const uploadTask = uploadBytesResumable(storageRef, image, contentType);
    uploadTask.on('state_changed',
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        console.log('Upload is ' + progress + '% done');
        switch (snapshot.state) {
          case 'paused':
            console.log('Upload is paused');
            break;
          case 'running':
            console.log('Upload is running');
            break;
        }
      },
      (error) => {
        // Handle unsuccessful uploads
        console.log('unsuccessful uploads');
      },
      () => {
        getDownloadURL(uploadTask.snapshot.ref).then((downloadURL) => {
          console.log('File available at', downloadURL);
        });
      }
    );

    try {
      await uploadTask;

      let downloadURL = await getDownloadURL(storageRef);

      const data = {
        recipe: result,
        media: downloadURL,
        comment: comment,
        starDelicious: starDelicious,
        starEasy: starEasy,
        starConviniency: starConviniency,
      };

      const newRecipeRef = dbRef(db, 'review/' + Date.now());
      set(newRecipeRef, data);

      navigation.navigate('Home');
      setIsLoading(false);

    } catch (e) {
      console.error(e);
      setIsLoading(false);
    }
  }

  return (
    <View style={{ flex: 1, justifyContent: 'center' }}>
      <Card style={{ margin: 20 }}>
        <Card.Title title="レシピ" />
        <Card.Content>
          <Paragraph>{result}</Paragraph>
        </Card.Content>
      </Card>

      <Card style={{ margin: 20 }}>
        <Card.Title title="レビュー" />
        <Card.Content>
          <Paragraph>このレシピで作った料理のレビューをしましょう！</Paragraph>

          <TouchableOpacity style={styles.button} onPress={pickImage}>
            <Text style={styles.buttonText}>完成した料理をアップロード</Text>
          </TouchableOpacity>

          {image && <Card.Cover source={{ uri: image }} style={{ marginTop: 20 }} />}
          <Title style={{ marginTop: 20 }}>感想</Title>
          <TextInput
            label="感想"
            value={comment}
            onChangeText={text => setComment(text)}
            mode='outlined'
            multiline={true}
            numberOfLines={4}
            style={{ marginTop: 20, backgroundColor: '#FFFFFF', borderRadius: 10, padding: 10 }}
          />
          <Title style={{ marginTop: 20 }}>美味しさ:</Title>
          <StarRating
            disabled={false}
            maxStars={5}
            rating={starDelicious}
            onChange={setStarDelicious}
          />

          <Title style={{ marginTop: 20 }}>調理の簡単さ:</Title>
          <StarRating
            disabled={false}
            maxStars={5}
            rating={starEasy}
            onChange={setStarEasy}
          />

          <Title style={{ marginTop: 20 }}>調理の手軽さ:</Title>
          <StarRating
            disabled={false}
            maxStars={5}
            rating={starConviniency}
            onChange={setStarConviniency}
          />

          {isLoading ? (
            <ActivityIndicator size="small" color="#6200ee" />
          ) : (
            <TouchableOpacity style={styles.button} onPress={handleSubmit}>
              <Text style={styles.buttonText}>送信</Text>
            </TouchableOpacity>
          )}

        </Card.Content>
      </Card>
    </View >
  );
}


export default function App() {
  return (
    <PaperProvider>
      <NavigationContainer>
        <Stack.Navigator
          initialRouteName="Home"
          screenOptions={{
            headerStyle: {
              backgroundColor: '#6200ee',
            },
            headerTintColor: '#fff',
            headerTitleStyle: {
              fontWeight: 'bold',
              fontSize: 24,
            },
          }}
        >
          <Stack.Screen
            name="Home"
            component={HomeScreen}
            options={({ navigation }) => ({
              title: "Recipidea",
              headerRight: () => (
                <>
                  <View style={{ marginRight: 10 }}>
                    <Button
                      onPress={() => navigation.navigate('Recipe')}
                      title="レシピ作成"
                      color="#03DAC6" // Set your own color
                    />
                  </View>

                </>
              ),
            })}
          />
          <Stack.Screen name="Review" component={ReviewScreen} />
          <Stack.Screen name="Recipe" component={RecipeScreen} />
          <Stack.Screen name="Details" component={DetailsScreen} />
          <Stack.Screen name="Loading" component={LoadingScreen} />
        </Stack.Navigator>
      </NavigationContainer >
    </PaperProvider>
  );
}

const numColumns = 3;
const size = Dimensions.get('window').width / numColumns;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'flex-start',
    padding: 10,
  },
  wrapTextArea: {
    backgroundColor: '#fff',
    borderColor: '#000000',
    borderWidth: 1,
  },
  textArea: { padding: 10 },
  card: {
    width: 300,
    height: 300,
    justifyContent: 'flex-start',
    margin: 3,
  },
  title: {
    color: '#212121',
    fontSize: 16,
  },
  paragraph: {
    color: '#757575',
  },
  tag: {
    backgroundColor: 'skyblue',
    borderRadius: 50,
    margin: 5,
    padding: 10,
  },
  tagText: {
    color: 'white',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    padding: 10,
  },
  chip: {
    margin: 5,
  },
  button: {
    backgroundColor: '#3F51B5',
    color: '#FFFFFF',
    padding: 10,
    borderRadius: 5,
    marginVertical: 10,
    marginTop: 20
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    textAlign: 'center',
  },
});
