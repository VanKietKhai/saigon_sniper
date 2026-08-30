import 'package:flutter/material.dart';
import 'package:camera/camera.dart';
import 'screens/home_screen.dart';

// Tạo một biến toàn cục để lưu danh sách camera của iPhone
List<CameraDescription> cameras = [];

Future<void> main() async {
  // Đảm bảo Flutter đã khởi tạo xong trước khi tìm camera
  WidgetsFlutterBinding.ensureInitialized();
  
  try {
    cameras = await availableCameras(); // Lấy danh sách camera (trước, sau)
  } catch (e) {
    print("Lỗi khởi tạo camera: $e");
  }

  runApp(const SaigonSniperApp());
}

class SaigonSniperApp extends StatelessWidget {
  const SaigonSniperApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Saigon Sniper',
      debugShowCheckedModeBanner: false, // Ẩn chữ Debug góc phải
      theme: ThemeData(
        // Cài đặt tông màu chủ đạo cho toàn bộ app
        scaffoldBackgroundColor: const Color(0xFF1E3522), // Màu nền xanh rêu
        primaryColor: const Color(0xFFF39C12), // Màu cam của nút bấm
        textTheme: const TextTheme(
          bodyMedium: TextStyle(color: Colors.white), // Chữ mặc định màu trắng
        ),
      ),
      home: const HomeScreen(), // Màn hình đầu tiên gọi lên là HomeScreen
    );
  }
}
