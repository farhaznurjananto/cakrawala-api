# Gunakan node image sebagai base image
FROM node:14

# Setelah itu, buat direktori app di dalam container
WORKDIR /app

# Salin package.json dan package-lock.json ke direktori /app
COPY package*.json ./

# Install dependensi aplikasi
RUN npm install

# Salin seluruh kode sumber aplikasi ke dalam container
COPY . .

# Port yang akan digunakan oleh aplikasi Express
EXPOSE 8080

# CMD digunakan untuk menentukan perintah default yang akan dijalankan ketika container berjalan
CMD ["npm", "start"]
