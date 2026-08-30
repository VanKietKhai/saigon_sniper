import 'package:flutter/material.dart';
import 'setup_screen.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      // Màu nền xanh rêu đậm toàn màn hình
      backgroundColor: const Color(0xFF172C19),

      // Thanh tiêu đề trên cùng
      appBar: AppBar(
        backgroundColor: Colors.transparent, // Trong suốt để tiệp với nền
        elevation: 0, // Xóa hiệu ứng đổ bóng của AppBar
        centerTitle: true,
        title: const Text(
          'SAIGON SNIPER - CHỌN BIA BẮN',
          style: TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.bold,
            color: Colors.white,
          ),
        ),
      ),

      // Dùng SingleChildScrollView để màn hình có thể cuộn lên xuống
      // tránh lỗi tràn viền nếu chạy trên điện thoại màn hình nhỏ
      body: SingleChildScrollView(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
          child: Column(
            children: [
              // Nút bấm Bia súng trường
              _buildTargetCard(
                title: 'BIA SÚNG TRƯỜNG',
                imagePath: 'assets/small_target.png', // Đảm bảo tên file ảnh khớp với thư mục assets
                onTap: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (context) => const SetupScreen(loaiBia: 'SÚNG TRƯỜNG'),
                    ),
                  );
                },
                ),
  
              const SizedBox(height: 30), // Khoảng cách giữa 2 thẻ
              // Nút bấm Bia súng ngắn
              _buildTargetCard(
                title: 'BIA SÚNG NGẮN',
                imagePath: 'assets/pistol_target.png',
                onTap: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (context) => const SetupScreen(loaiBia: 'SÚNG NGẮN'),
                    ),
                  );
                },
              ),

              const SizedBox(height: 20), // Khoảng cách an toàn ở đáy màn hình
            ],
          ),
        ),
      ),
    );
  }

  // Khối Card giao diện mới
  Widget _buildTargetCard({
    required String title,
    required String imagePath,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: const Color(0xFF28482F), // Màu xanh rêu sáng làm nền thẻ
          borderRadius: BorderRadius.circular(16), // Bo góc thẻ
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.4),
              blurRadius: 10,
              offset: const Offset(0, 5), // Đổ bóng tạo cảm giác nút nổi 3D
            ),
          ],
        ),
        child: Column(
          children: [
            // Tiêu đề thẻ
            Text(
              title,
              style: const TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.bold,
                color: Colors.white,
                letterSpacing:
                    1.2, // Kéo dãn khoảng cách các chữ cái cho ngầu hơn
              ),
            ),
            const SizedBox(height: 16), // Khoảng cách giữa chữ và hình
            // Hình ảnh tấm bia
            ClipRRect(
              borderRadius: BorderRadius.circular(8), // Bo góc nhẹ cho tấm hình
              child: Image.asset(imagePath, fit: BoxFit.cover),
            ),
          ],
        ),
      ),
    );
  }
}
